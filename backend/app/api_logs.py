from __future__ import annotations

from app.db import DBConnection

import json
import threading
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as HttpResponse

from .config import get_settings
from .security import decode_access_token

settings = get_settings()

LOG_WRITE_LOCK = threading.Lock()

API_ACTIONS = {
    "/api/v1/sync/last_sync_time": "query_cursor",
    "/api/v1/ingest/deals": "ingest_deals",
    "/api/v1/sync/update_last_sync_time": "update_cursor",
    "/api/v1/ingest/symbols": "ingest_symbols",
    "/api/v1/ingest/snapshots": "ingest_snapshots",
    "/api/v1/ingest/settings": "ingest_settings",
    "/api/v1/ingest/heartbeat": "heartbeat",
    "/api/v1/auth/send-code": "send_login_code",
    "/api/v1/auth/verify-code": "verify_login_code",
    "/api/v1/accounts": "account_collection",
    "/api/v1/my/api-logs": "query_api_logs",
}


def _json_object_from_bytes(raw: bytes) -> dict | None:
    if not raw:
        return None
    try:
        value = json.loads(raw.decode("utf-8"))
    except Exception:
        return None
    return value if isinstance(value, dict) else None


def _api_action(path: str) -> str:
    if path in API_ACTIONS:
        return API_ACTIONS[path]
    if path.startswith("/api/v1/my/accounts/") and (path.endswith("/deals") or path.endswith("/positions")):
        return "query_account_data"
    if path.startswith("/api/v1/my/accounts/") and path.endswith("/settings"):
        return "query_settings"
    if path.startswith("/api/v1/accounts/") and path.endswith("/regenerate-key"):
        return "regenerate_sync_key"
    if path.startswith("/api/v1/accounts/"):
        return "account_management"
    if path.startswith("/api/v1/"):
        return path.removeprefix("/api/v1/").replace("/", "_")
    return "api"


def _summarize_api_request(path: str, payload: dict | None) -> tuple[int | None, dict]:
    summary: dict = {"counts": {}}
    mt5_login = None
    if not payload:
        return None, summary

    for key in ("mt5_login", "account_login"):
        value = payload.get(key)
        if isinstance(value, int) and value > 0:
            mt5_login = value

    for key in ("deals", "symbols", "snapshots"):
        value = payload.get(key)
        if isinstance(value, list):
            summary["counts"][key] = len(value)

    settings_value = payload.get("settings")
    if isinstance(settings_value, dict):
        summary["counts"]["settings"] = 1
        summary["settings_groups"] = len(settings_value)
        summary["settings_keys"] = sum(len(group) for group in settings_value.values() if isinstance(group, dict))

    for key in (
        "sync_run_id", "batch_index", "batch_count", "deal_count",
    ):
        if isinstance(payload.get(key), int):
            summary[key] = int(payload[key])
    for key in ("batch_id", "instance_id", "protocol_version", "batch_hash"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            summary[key] = value[:120]
    if isinstance(payload.get("last_sync_time"), int):
        summary["last_sync_time"] = int(payload["last_sync_time"])
    if isinstance(payload.get("snapshot_time"), int):
        summary["snapshot_time"] = int(payload["snapshot_time"])
    if path.endswith("/auth/send-code") or path.endswith("/auth/verify-code"):
        # Never retain email addresses, codes, tokens, or sync keys.
        summary["has_email"] = bool(payload.get("email"))
        summary["has_phone"] = bool(payload.get("phone"))
        summary["has_code"] = bool(payload.get("code"))
    return mt5_login, summary


def _summarize_api_response(path: str, payload: object) -> tuple[dict, int | None, int | None, int | None]:
    summary: dict = {}
    mt5_login = None
    account_id = None
    item_count = None
    scalar_keys = {
        "last_sync_time", "updated", "accepted", "inserted", "updated",
        "duplicates", "duplicated", "rejected", "pending_cursor",
        "handshake_confirmed", "batches_received", "batches_expected",
        "deals_received", "ok", "server_time", "is_new_user", "id",
        "mt5_login", "deal_count", "synced_order_count", "symbol_count",
        "snapshot_count", "code", "message",
    }

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            return {"error": True}, None, None, None
        for key in scalar_keys:
            if key in payload and isinstance(payload[key], int | float | bool | str):
                summary[key] = payload[key]
        if isinstance(payload.get("mt5_login"), int):
            mt5_login = int(payload["mt5_login"])
        if isinstance(payload.get("id"), int) and "/accounts" in path:
            account_id = int(payload["id"])
        data = payload.get("data")
        if isinstance(data, dict) and isinstance(data.get("received_at"), int):
            summary["received_at"] = int(data["received_at"])
        for key in ("deals", "symbols", "snapshots", "items"):
            if isinstance(payload.get(key), list):
                summary[f"{key}_returned"] = len(payload[key])
                item_count = len(payload[key])
        if isinstance(payload.get("total"), int):
            summary["total"] = int(payload["total"])
    elif isinstance(payload, list):
        count = len(payload)
        summary["returned_items"] = count
        if path.endswith("/accounts"):
            summary["returned_accounts"] = count
        if path.endswith("/deals"):
            summary["deals_returned"] = count
        elif path.endswith("/positions"):
            summary["positions_returned"] = count
        elif path.endswith("/settings"):
            summary["settings_returned"] = count
        item_count = count

    if item_count is None and isinstance(summary.get("accepted"), int):
        item_count = summary["accepted"]
    return summary, mt5_login, account_id, item_count


def _extract_path_account_id(path: str) -> int | None:
    parts = path.strip("/").split("/")
    try:
        if len(parts) >= 4 and parts[0:3] == ["api", "v1", "accounts"]:
            return int(parts[3])
        if len(parts) >= 5 and parts[0:3] == ["api", "v1", "my"] and parts[3] == "accounts":
            return int(parts[4])
    except ValueError:
        return None
    return None


def _write_api_log(
    *,
    db: DBConnection,
    request,
    request_body: bytes,
    response_body: bytes,
    status_code: int,
    duration_ms: int,
) -> None:
    path = request.url.path
    if not path.startswith("/api/"):
        return

    request_payload = _json_object_from_bytes(request_body)
    if request_payload is None:
        query_summary: dict = {}
        if "mt5_login" in request.query_params:
            try:
                query_summary["mt5_login"] = int(request.query_params["mt5_login"])
            except (TypeError, ValueError):
                query_summary["invalid_mt5_login"] = True
        for key in ("success", "limit", "include_closed"):
            if key in request.query_params:
                query_summary[key] = request.query_params[key]
        request_payload = query_summary or None
    try:
        response_payload = json.loads(response_body.decode("utf-8"))
    except Exception:
        response_payload = None
    request_login, request_summary = _summarize_api_request(path, request_payload)
    response_summary, response_login, response_account_id, response_count = _summarize_api_response(path, response_payload)

    mt5_login = request_login or response_login
    account_id = response_account_id or _extract_path_account_id(path)
    user_id = None

    authorization = request.headers.get("authorization", "")
    if authorization.startswith("Bearer ") and not authorization[7:].startswith(("sk_live_", "sk_test_", "ts.")):
        try:
            user_id = int(decode_access_token(authorization[7:], settings).get("sub"))
        except Exception:
            user_id = None

    if account_id is None or mt5_login is None:
        if mt5_login is not None:
            row = db.execute("SELECT id, user_id FROM accounts WHERE mt5_login = ?", (mt5_login,)).fetchone()
        elif account_id is not None:
            row = db.execute("SELECT id, user_id, mt5_login FROM accounts WHERE id = ?", (account_id,)).fetchone()
        else:
            row = None
        if row is not None:
            account_id = int(row["id"])
            user_id = user_id or int(row["user_id"])
            if mt5_login is None and "mt5_login" in row.keys():
                mt5_login = int(row["mt5_login"])

    counts = request_summary.get("counts", {}) if isinstance(request_summary, dict) else {}
    item_count = None
    for key in ("deals", "symbols", "snapshots", "settings"):
        if isinstance(counts.get(key), int):
            item_count = counts[key]
            break
    if item_count is None:
        item_count = response_count
    candidate_cursor = request_summary.get("last_sync_time") if isinstance(request_summary, dict) else None

    error_code = error_message = None
    if isinstance(response_payload, dict) and isinstance(response_payload.get("error"), dict):
        error = response_payload["error"]
        error_code = str(error.get("code") or "")[:100] or None
        message = error.get("message")
        error_message = str(message)[:300] if message else None

    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    trace_id = request.headers.get("x-request-id") or request.headers.get("x-trace-id")
    trace_id = trace_id[:80] if trace_id else None
    sync_run_id = request_summary.get("sync_run_id") if isinstance(request_summary, dict) else None
    if not isinstance(sync_run_id, int) and isinstance(response_summary, dict):
        sync_run_id = response_summary.get("sync_run_id")
    batch_id = request_summary.get("batch_id") if isinstance(request_summary, dict) else None
    if not isinstance(batch_id, str) and isinstance(response_summary, dict):
        batch_id = response_summary.get("batch_id")

    def count_value(source: dict, key: str) -> int | None:
        value = source.get(key)
        return int(value) if isinstance(value, int) else None

    inserted_count = count_value(response_summary, "inserted")
    updated_count = count_value(response_summary, "updated")
    duplicated_count_raw = response_summary.get("duplicates", response_summary.get("duplicated")) if isinstance(response_summary, dict) else None
    duplicated_count = int(duplicated_count_raw) if isinstance(duplicated_count_raw, int) else None
    rejected_count = count_value(response_summary, "rejected")

    db.execute(
        """
        INSERT INTO api_logs (
            created_at, user_id, account_id, mt5_login, method, path, action,
            status_code, success, duration_ms, item_count, last_sync_time,
            request_summary, response_summary, error_code, error_message, client_ip,
            trace_id, sync_run_id, batch_id, inserted_count, updated_count,
            duplicated_count, rejected_count
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE (?::integer IS NULL AND ?::bigint IS NULL)
             OR EXISTS(SELECT 1 FROM accounts WHERE id=? OR mt5_login=?)
        """,
        (
            created_at, user_id, account_id, mt5_login, request.method, path[:250],
            _api_action(path), status_code, 1 if 200 <= status_code < 300 else 0,
            duration_ms, item_count, candidate_cursor,
            json.dumps(request_summary, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
            json.dumps(response_summary, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
            error_code, error_message, request.client.host if request.client else None,
            trace_id, sync_run_id if isinstance(sync_run_id, int) else None,
            batch_id if isinstance(batch_id, str) else None,
            inserted_count, updated_count, duplicated_count, rejected_count,
            account_id, mt5_login, account_id, mt5_login,
        ),
    )
    db.commit()


class ApiLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)
        # Binary images must remain streamed/bounded by the attachment endpoint,
        # never buffered or decoded as JSON by the audit logger.
        if path.startswith("/api/v1/my/review-attachments/") or (path.startswith("/api/v1/my/reviews/") and path.endswith("/attachments")):
            return await call_next(request)

        request_body = await request.body()

        async def receive():
            return {"type": "http.request", "body": request_body, "more_body": False}

        request._receive = receive
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.perf_counter() - started) * 1000)
            try:
                with LOG_WRITE_LOCK:
                    _write_api_log(
                        db=request.app.state.db,
                        request=request,
                        request_body=request_body,
                        response_body=json.dumps({"error": {"code": "INTERNAL_ERROR"}}).encode("utf-8"),
                        status_code=500,
                        duration_ms=duration_ms,
                    )
            except Exception:
                pass
            raise

        chunks: list[bytes] = []
        async for chunk in response.body_iterator:
            chunks.append(chunk)
        response_body = b"".join(chunks)
        duration_ms = int((time.perf_counter() - started) * 1000)

        try:
            with LOG_WRITE_LOCK:
                _write_api_log(
                    db=request.app.state.db,
                    request=request,
                    request_body=request_body,
                    response_body=response_body,
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                )
        except Exception as exc:
            print(f"[api-logs] failed to write audit log: {exc}")

        headers = dict(response.headers)
        headers.pop("content-length", None)
        return HttpResponse(
            content=response_body,
            status_code=response.status_code,
            headers=headers,
            media_type=response.media_type,
        )
