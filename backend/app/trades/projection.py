from app.db import DBConnection
"""Derived trades: dirty rows, rebuilds and source references commit together."""
import json

from .lifecycle import build_lifecycles
from ..schemas import TradeOut


def refresh(db: DBConnection, user_id: int):
    pending = """SELECT d.account_login,d.position_id,a.id AS account_id
                 FROM trade_dirty_positions d JOIN accounts a ON a.mt5_login=d.account_login
                 WHERE a.user_id=? ORDER BY a.id,d.position_id"""
    if db.execute(pending, (user_id,)).fetchone() is None:
        return
    db.execute("BEGIN IMMEDIATE")
    try:
        for dirty in db.execute(pending, (user_id,)).fetchall():
            rows = db.execute("SELECT * FROM deals WHERE account_login=? AND position_id=? ORDER BY deal_time,ticket",
                              (dirty["account_login"], dirty["position_id"])).fetchall()
            previous = {row["id"] for row in db.execute(
                "SELECT id FROM trade_lifecycles WHERE account_id=? AND position_id=?",
                (dirty["account_id"], dirty["position_id"]))}
            for lifecycle in build_lifecycles(dirty["account_login"], rows):
                summary = lifecycle.summary
                payload = json.dumps(summary.model_dump(), separators=(",", ":"), sort_keys=True)
                db.execute("""INSERT INTO trade_lifecycles
                    (account_id,position_id,anchor_ticket,symbol,direction,status,open_time,close_time,payload_json)
                    VALUES(?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(account_id,position_id,anchor_ticket) DO UPDATE SET
                    symbol=excluded.symbol,direction=excluded.direction,status=excluded.status,
                    open_time=excluded.open_time,close_time=excluded.close_time,payload_json=excluded.payload_json""",
                    (dirty["account_id"], dirty["position_id"], lifecycle.anchor_ticket, summary.symbol,
                     summary.direction, summary.reconciliation_status, summary.open_time, summary.close_time, payload))
                trade_id = db.execute("SELECT id FROM trade_lifecycles WHERE account_id=? AND position_id=? AND anchor_ticket=?",
                                      (dirty["account_id"], dirty["position_id"], lifecycle.anchor_ticket)).fetchone()[0]
                previous.discard(trade_id)
                db.execute("DELETE FROM trade_allocations WHERE trade_id=?", (trade_id,))
                db.executemany("""INSERT INTO trade_allocations
                    (trade_id,deal_ticket,role,volume,profit,swap,commission,method) VALUES(?,?,?,?,?,?,?,?)""",
                    [(trade_id, allocation["deal_ticket"], allocation["role"], allocation["volume"],
                      allocation["profit"], allocation["swap"], allocation["commission"], allocation["method"])
                     for allocation in lifecycle.allocations])
            for obsolete_id in previous:
                db.execute("DELETE FROM trade_lifecycles WHERE id=?", (obsolete_id,))
            db.execute("DELETE FROM trade_dirty_positions WHERE account_login=? AND position_id=?",
                       (dirty["account_login"], dirty["position_id"]))
        db.commit()
    except Exception:
        db.rollback()
        raise


REVIEW_JOIN = """ LEFT JOIN trade_reviews r ON r.account_id=t.account_id AND r.position_id=t.position_id AND r.anchor_ticket=t.anchor_ticket
 LEFT JOIN review_evaluations re ON re.review_id=r.id
 LEFT JOIN playbook_versions pv ON pv.id=re.playbook_version_id
 LEFT JOIN setups su ON su.id=pv.setup_id
 LEFT JOIN trade_reconciliation_cases rc ON rc.user_id=a.user_id AND rc.account_id=t.account_id
    AND rc.position_id=CAST(t.position_id AS TEXT) AND rc.anchor_ticket=CAST(t.anchor_ticket AS TEXT) """
REVIEW_COLUMNS = """,r.status AS review_status,r.source_hash AS review_source_hash,
 su.id AS setup_id,su.name AS setup_name,pv.version AS playbook_version,
 re.complete AS evaluation_complete,re.coverage AS execution_coverage,re.score AS execution_score,
 re.compliance AS execution_compliance,re.critical_failures_json AS critical_failures_json,
 rc.state AS reconciliation_case_state,rc.resolution AS reconciliation_resolution,
 rc.note AS reconciliation_note,rc.updated_at AS reconciliation_updated_at"""


def trade_out(row, db):
    from .reviews import source_hash
    return TradeOut(**json.loads(row["payload_json"]), trade_id=row["id"], anchor_ticket=row["anchor_ticket"],
                    review_status=row["review_status"] or "unwritten",
                    review_source_changed=bool(row["review_source_hash"] and source_hash(db, row) != row["review_source_hash"]),
                    setup_id=row["setup_id"], setup_name=row["setup_name"], playbook_version=row["playbook_version"],
                    evaluation_complete=bool(row["evaluation_complete"]) if row["evaluation_complete"] is not None else None,
                    execution_coverage=row["execution_coverage"], execution_score=row["execution_score"],
                    execution_compliance=row["execution_compliance"],
                    critical_failures=json.loads(row["critical_failures_json"] or "[]"),
                    reconciliation_case_state=row["reconciliation_case_state"],
                    reconciliation_resolution=row["reconciliation_resolution"],
                    reconciliation_note=row["reconciliation_note"],
                    reconciliation_updated_at=row["reconciliation_updated_at"])


def page(db, user_id, account_id, page, page_size, symbol, direction, status_filter, start_time, end_time, sort,
         review_status=None, reconciliation_case=None):
    conditions = ["a.user_id=?"]
    args = [user_id]
    for clause, value in (("t.account_id=?", account_id), ("t.direction=?", direction),
                          ("t.open_time>=?", start_time), ("t.open_time<=?", end_time)):
        if value is not None:
            conditions.append(clause)
            args.append(value)
    if symbol:
        conditions.append("instr(upper(t.symbol),?) > 0")
        args.append(symbol.strip().upper())
    if status_filter:
        conditions.append("t.status=?")
        args.append({"open": "partial", "closed": "complete", "needs_review": "needs_review"}[status_filter])
    if review_status == "unwritten":
        conditions.append("r.id IS NULL")
    elif review_status:
        conditions.append("r.status=?")
        args.append(review_status)
    if reconciliation_case == "untracked":
        conditions.extend(["t.status='needs_review'", "rc.id IS NULL"])
    elif reconciliation_case:
        conditions.append("rc.state=?")
        args.append(reconciliation_case)
    source = " FROM trade_lifecycles t JOIN accounts a ON a.id=t.account_id" + REVIEW_JOIN + " WHERE " + " AND ".join(conditions)
    column = "t.close_time" if sort.startswith("close_") else "t.open_time"
    order = "DESC" if sort.endswith("_desc") else "ASC"
    # Keep count/page in one read snapshot when another request rebuilds the projection.
    db.execute("BEGIN")
    try:
        total = db.execute("SELECT COUNT(*)" + source, args).fetchone()[0]
        rows = db.execute("SELECT t.*" + REVIEW_COLUMNS + source +
                          f" ORDER BY COALESCE({column},0) {order},a.mt5_login {order},t.position_id {order},t.id {order} LIMIT ? OFFSET ?",
                          [*args, page_size, (page - 1) * page_size]).fetchall()
        items = [trade_out(row, db) for row in rows]
        db.commit()
        return items, total
    except Exception:
        db.rollback()
        raise
