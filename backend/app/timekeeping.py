from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.db import DBConnection, DBRow


def _as_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def resolve_timezone_profile(
    db: DBConnection,
    account: DBRow,
    *,
    broker_server_override: str | None = None,
    broker_company_override: str | None = None,
) -> DBRow | None:
    broker_server = str(broker_server_override or account.get("broker_server") or "").strip()
    broker_company = str(broker_company_override or account.get("broker_company") or "").strip()
    checks = (
        ("broker_server", broker_server),
        ("broker_company", broker_company),
    )
    for match_type, value in checks:
        if not value:
            continue
        row = db.execute(
            """
            SELECT *
              FROM broker_timezone_profiles
             WHERE enabled = 1
               AND match_type = %s
               AND LOWER(match_value) = LOWER(%s)
             ORDER BY confidence DESC, id ASC
             LIMIT 1
            """,
            (match_type, value),
        ).fetchone()
        if row is not None:
            return row
    if broker_server:
        return db.execute(
            """
            SELECT *
              FROM broker_timezone_profiles
             WHERE enabled = 1
               AND match_type = 'pattern'
               AND %s ILIKE match_value
             ORDER BY confidence DESC, id ASC
             LIMIT 1
            """,
            (broker_server,),
        ).fetchone()
    return None


def schedule_timezone_backfill(
    db: DBConnection,
    account: DBRow,
    *,
    broker_server_override: str | None = None,
    broker_company_override: str | None = None,
) -> bool:
    profile = resolve_timezone_profile(
        db,
        account,
        broker_server_override=broker_server_override,
        broker_company_override=broker_company_override,
    )
    if profile is None:
        return False

    missing = db.execute(
        """
        SELECT COUNT(*) AS missing_count
          FROM deals
         WHERE account_login = %s
           AND server_deal_time IS NULL
        """,
        (int(account["mt5_login"]),),
    ).fetchone()
    missing_count = int(missing["missing_count"] or 0) if missing is not None else 0
    if missing_count == 0:
        return renormalize_account_times(db, account, profile)

    connections = db.execute(
        """
        SELECT connector_version
          FROM connector_connections
         WHERE account_id=%s
        """,
        (account["id"],),
    ).fetchall()
    if not connections:
        return False
    for connection in connections:
        version = str(connection.get("connector_version") or "")
        parts = version.split(".")
        try:
            numeric = tuple(int(item) for item in parts[:3])
        except ValueError:
            return False
        if numeric < (2, 0, 1):
            return False

    cursor = max(int(account.get("sync_start_time") or 0), 0)
    connection_ids = db.execute(
        "SELECT id FROM connector_connections WHERE account_id=%s",
        (account["id"],),
    ).fetchall()
    for row in connection_ids:
        connection_id = int(row["id"])
        db.execute("DELETE FROM connector_events WHERE connection_id=%s", (connection_id,))
        db.execute("DELETE FROM connector_batches WHERE connection_id=%s", (connection_id,))
    db.execute(
        """
        UPDATE connector_connections
           SET cursor_value=%s,
               cursor_state_json='{}',
               updated_at=now_iso()
         WHERE account_id=%s
        """,
        (cursor, account["id"]),
    )
    db.execute(
        """
        UPDATE accounts
           SET timezone_backfill_required=1,
               last_sync_time=0,
               resync_pending=1,
               updated_at=now_iso()
         WHERE id=%s
        """,
        (account["id"],),
    )
    return True


def renormalize_account_times(
    db: DBConnection,
    account: DBRow,
    profile: DBRow | None = None,
) -> bool:
    profile = profile or resolve_timezone_profile(db, account)
    if profile is None:
        return False
    profile_id = int(profile["id"])
    if (
        int(account.get("timezone_profile_id") or 0) == profile_id
        and not int(account.get("timezone_backfill_required") or 0)
    ):
        return False

    timezone_name = str(profile["timezone_name"]).strip() if profile.get("timezone_name") else None
    fixed_offset = _as_int(profile.get("fixed_offset_seconds"))
    rows = db.execute(
        """
        SELECT ticket, server_open_time, server_deal_time, open_time, deal_time
          FROM deals
         WHERE account_login = %s
           AND server_deal_time IS NOT NULL
        """,
        (int(account["mt5_login"]),),
    ).fetchall()
    changed = 0
    for row in rows:
        raw_deal = _as_int(row.get("server_deal_time"))
        raw_open = _as_int(row.get("server_open_time"))
        if raw_deal is None:
            continue
        resolved_deal = None
        resolved_open = None
        if timezone_name:
            resolved_deal = _server_time_to_utc(raw_deal, timezone_name)
            resolved_open = _server_time_to_utc(raw_open, timezone_name) if raw_open is not None else None
        elif fixed_offset is not None:
            resolved_deal = raw_deal - fixed_offset
            resolved_open = raw_open - fixed_offset if raw_open is not None else None
        if resolved_deal is None:
            continue
        db.execute(
            """
            UPDATE deals
               SET open_time=COALESCE(%s, open_time),
                   deal_time=%s,
                   timezone_profile_id=%s,
                   time_normalized_at=now_iso()
             WHERE account_login=%s AND ticket=%s
            """,
            (
                resolved_open,
                resolved_deal,
                profile_id,
                int(account["mt5_login"]),
                int(row["ticket"]),
            ),
        )
        changed += 1

    db.execute(
        """
        UPDATE accounts
           SET timezone_profile_id=%s,
               timezone_normalized_at=now_iso(),
               timezone_normalization_revision=timezone_normalization_revision + 1,
               timezone_backfill_required=0,
               updated_at=now_iso()
         WHERE id=%s
        """,
        (profile_id, account["id"]),
    )
    return changed > 0 or bool(int(account.get("timezone_backfill_required") or 0))


def _server_time_to_utc(server_time: int, timezone_name: str) -> int | None:
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return None
    local = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=server_time)
    return int(local.replace(tzinfo=zone).timestamp())


_DST_RULES = (
    ("eu", "Europe/Athens", 7200, 10800),
    ("uk", "Europe/London", 0, 3600),
    ("us", "America/New_York", -18000, -14400),
    ("au", "Australia/Sydney", 36000, 39600),
)


def _promote_timezone_candidate(db: DBConnection, candidate: DBRow) -> bool:
    if str(candidate.get("status") or "") == "matched":
        return False
    min_offset = _as_int(candidate.get("min_observed_offset_seconds"))
    max_offset = _as_int(candidate.get("max_observed_offset_seconds"))
    transition_count = int(candidate.get("transition_count") or 0)
    if min_offset is None or max_offset is None or transition_count <= 0:
        return False

    for _, timezone_name, winter, summer in _DST_RULES:
        if min_offset != winter or max_offset != summer:
            continue
        match_type = "broker_server" if candidate.get("broker_server") else "broker_company"
        match_value = candidate.get("broker_server") or candidate.get("broker_company")
        if not match_value:
            return False
        db.execute(
            """
            INSERT INTO broker_timezone_profiles (
                match_type, match_value, timezone_name, dst_profile, confidence
            ) VALUES (%s, %s, %s, %s, 82)
            ON CONFLICT(match_type, match_value) DO NOTHING
            """,
            (match_type, str(match_value), timezone_name, "observed"),
        )
        db.execute(
            """
            UPDATE broker_timezone_candidates
               SET inferred_timezone=%s,
                   confidence=82,
                   status='matched',
                   last_promoted_at=now_iso()
             WHERE id=%s
            """,
            (timezone_name, candidate["id"]),
        )
        return True
    return False


def observe_timezone_candidate(
    db: DBConnection,
    *,
    platform: str,
    broker_server: str | None,
    broker_company: str | None,
    observed_offset_seconds: int | None,
) -> None:
    server = (broker_server or "").strip()[:120] or None
    company = (broker_company or "").strip()[:120] or None
    if observed_offset_seconds is None or (server is None and company is None):
        return
    broker_key = f"{platform.lower()}|{(server or '').lower()}|{(company or '').lower()}"
    db.execute(
        """
        INSERT INTO broker_timezone_candidates (
            broker_key, broker_server, broker_company, platform, observed_offset_seconds,
            min_observed_offset_seconds, max_observed_offset_seconds
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT(broker_key) DO UPDATE SET
            broker_server=COALESCE(excluded.broker_server, broker_timezone_candidates.broker_server),
            broker_company=COALESCE(excluded.broker_company, broker_timezone_candidates.broker_company),
            observed_offset_seconds=excluded.observed_offset_seconds,
            min_observed_offset_seconds=LEAST(
                COALESCE(broker_timezone_candidates.min_observed_offset_seconds, excluded.observed_offset_seconds),
                excluded.observed_offset_seconds
            ),
            max_observed_offset_seconds=GREATEST(
                COALESCE(broker_timezone_candidates.max_observed_offset_seconds, excluded.observed_offset_seconds),
                excluded.observed_offset_seconds
            ),
            last_seen_at=now_iso(),
            observation_count=broker_timezone_candidates.observation_count + 1,
            transition_count=broker_timezone_candidates.transition_count + CASE
                WHEN broker_timezone_candidates.observed_offset_seconds IS NOT NULL
                 AND broker_timezone_candidates.observed_offset_seconds <> excluded.observed_offset_seconds
                THEN 1 ELSE 0 END
        """,
        (
            broker_key,
            server,
            company,
            platform,
            observed_offset_seconds,
            observed_offset_seconds,
            observed_offset_seconds,
        ),
    )
    candidate = db.execute(
        "SELECT * FROM broker_timezone_candidates WHERE broker_key=%s",
        (broker_key,),
    ).fetchone()
    if candidate is not None:
        _promote_timezone_candidate(db, candidate)


def resolve_trade_times(
    db: DBConnection,
    account: DBRow,
    data: dict,
) -> tuple[int, int, int | None]:
    utc_open = _as_int(data.get("open_time"))
    utc_deal = _as_int(data.get("deal_time"))
    raw_open = _as_int(data.get("server_open_time"))
    raw_deal = _as_int(data.get("server_deal_time"))
    observed_offset = _as_int(data.get("server_gmt_offset"))

    profile = resolve_timezone_profile(db, account)
    timezone_name = str(profile["timezone_name"]).strip() if profile is not None and profile.get("timezone_name") else None
    profile_id = int(profile["id"]) if profile is not None else None

    if raw_deal is not None and timezone_name:
        normalized_deal = _server_time_to_utc(raw_deal, timezone_name)
        normalized_open = _server_time_to_utc(raw_open, timezone_name) if raw_open is not None else utc_open
        if normalized_deal is not None:
            return (
                normalized_open if normalized_open is not None else utc_open or normalized_deal,
                normalized_deal,
                profile_id,
            )

    fixed_offset = None
    if profile is not None:
        fixed_offset = _as_int(profile.get("fixed_offset_seconds"))
    if fixed_offset is None:
        fixed_offset = observed_offset
    if raw_deal is not None and fixed_offset is not None:
        normalized_deal = raw_deal - fixed_offset
        normalized_open = raw_open - fixed_offset if raw_open is not None else utc_open
        if profile is None:
            observe_timezone_candidate(
                db,
                platform=str(account.get("platform") or "mt5"),
                broker_server=account.get("broker_server"),
                broker_company=account.get("broker_company"),
                observed_offset_seconds=observed_offset,
            )
        return (
            normalized_open if normalized_open is not None else utc_open or normalized_deal,
            normalized_deal,
            profile_id,
        )

    if utc_open is None or utc_deal is None:
        raise ValueError("trade event is missing both normalized and server timestamps")
    return utc_open, utc_deal, profile_id


def update_deal_time_metadata(
    db: DBConnection,
    *,
    account_login: int,
    ticket: int,
    resolved_open: int,
    resolved_deal: int,
    timezone_profile_id: int | None,
    server_open_time: int | None,
    server_deal_time: int | None,
    server_gmt_offset: int | None,
) -> None:
    db.execute(
        """
        UPDATE deals SET
            server_open_time=COALESCE(server_open_time, %s),
            server_deal_time=COALESCE(server_deal_time, %s),
            timezone_profile_id=COALESCE(%s, timezone_profile_id),
            open_time=CASE
                WHEN %s IS NOT NULL OR server_deal_time IS NULL
                THEN %s ELSE open_time END,
            deal_time=CASE
                WHEN %s IS NOT NULL OR server_deal_time IS NULL
                THEN %s ELSE deal_time END,
            server_gmt_off=CASE
                WHEN %s IS NOT NULL AND %s <> 0 THEN %s
                ELSE server_gmt_off END,
            time_normalized_at=now_iso()
        WHERE account_login=%s AND ticket=%s
          AND (server_deal_time IS NULL OR %s IS NOT NULL)
        """,
        (
            server_open_time,
            server_deal_time,
            timezone_profile_id,
            timezone_profile_id,
            resolved_open,
            timezone_profile_id,
            resolved_deal,
            server_gmt_offset,
            server_gmt_offset,
            server_gmt_offset,
            account_login,
            ticket,
            timezone_profile_id,
        ),
    )
