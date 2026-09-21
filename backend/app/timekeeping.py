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


def _profile_for_account(db: DBConnection, account: DBRow) -> DBRow | None:
    broker_server = str(account.get("broker_server") or "").strip()
    broker_company = str(account.get("broker_company") or "").strip()
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


def _server_time_to_utc(server_time: int, timezone_name: str) -> int | None:
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return None
    local = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=server_time)
    return int(local.replace(tzinfo=zone).timestamp())


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
            broker_key, broker_server, broker_company, platform, observed_offset_seconds
        ) VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT(broker_key) DO UPDATE SET
            broker_server=COALESCE(excluded.broker_server, broker_timezone_candidates.broker_server),
            broker_company=COALESCE(excluded.broker_company, broker_timezone_candidates.broker_company),
            observed_offset_seconds=excluded.observed_offset_seconds,
            last_seen_at=now_iso(),
            observation_count=broker_timezone_candidates.observation_count + 1,
            transition_count=broker_timezone_candidates.transition_count + CASE
                WHEN broker_timezone_candidates.observed_offset_seconds IS NOT NULL
                 AND broker_timezone_candidates.observed_offset_seconds <> excluded.observed_offset_seconds
                THEN 1 ELSE 0 END
        """,
        (broker_key, server, company, platform, observed_offset_seconds),
    )


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

    profile = _profile_for_account(db, account)
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
