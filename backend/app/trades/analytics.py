"""Closed lifecycle performance using the SOP's UTC dates without timezone shifts."""
import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException

def summarize(trades):
    values = [Decimal(str(t["net_pnl"])) for t in trades]
    gains = sum((v for v in values if v > 0), Decimal(0))
    losses = -sum((v for v in values if v < 0), Decimal(0))
    wins, losing = sum(v > 0 for v in values), sum(v < 0 for v in values)
    balance = peak = drawdown = Decimal(0)
    for value in values:
        balance += value
        peak = max(peak, balance)
        drawdown = max(drawdown, peak - balance)
    return dict(count=len(values), wins=wins, losses=losing, breakeven=len(values)-wins-losing,
                net_pnl=float(balance), win_rate=wins / len(values) * 100 if values else None,
                profit_factor=float(gains / losses) if losses else None,
                payoff_ratio=float((gains / wins) / (losses / losing)) if wins and losing else None,
                average_pnl=float(balance / len(values)) if values else None,
                max_drawdown=float(drawdown))


def report(db, user_id, account_id, start_date: date, end_date: date, symbol=None, direction=None, tag=None, review_status=None, setup_id=None, execution_status=None):
    from . import projection
    if start_date.year < 1970 or start_date > end_date or (end_date - start_date).days > 3660 or end_date.year >= 9999:
        raise HTTPException(422, "Date range must be ordered and at most 3661 days")
    account = db.execute("SELECT * FROM accounts WHERE id=? AND user_id=?", (account_id, user_id)).fetchone()
    if account is None:
        raise HTTPException(404, "Account not found")
    projection.refresh(db, user_id)
    start = int(datetime.combine(start_date, datetime.min.time(), timezone.utc).timestamp())
    end = int(datetime.combine(end_date + timedelta(days=1), datetime.min.time(), timezone.utc).timestamp())
    conditions = ["t.account_id=?"]
    args = [account_id]
    if tag and tag.strip():
        conditions.append("EXISTS (SELECT 1 FROM json_each(r.tags_json) WHERE value=?)")
        args.append(tag.strip())
    if review_status == "unwritten":
        conditions.append("r.id IS NULL")
    elif review_status:
        conditions.append("r.status=?")
        args.append(review_status)
    if setup_id:
        conditions.append("su.id=?")
        args.append(setup_id)
    if execution_status == "unrated":
        conditions.append("re.id IS NULL")
    elif execution_status:
        conditions.append("re.compliance=?")
        args.append(execution_status)
    db.execute("BEGIN")
    try:
        account = db.execute("SELECT * FROM accounts WHERE id=? AND user_id=?", (account_id, user_id)).fetchone()
        if account is None:
            raise HTTPException(404, "Account not found")
        rows = db.execute("SELECT t.*,su.name AS setup_name,pv.version AS playbook_version,re.score AS execution_score,re.compliance AS execution_compliance,r.tags_json,r.reflection_json FROM trade_lifecycles t JOIN accounts a ON a.id=t.account_id" + projection.REVIEW_JOIN +
                          " WHERE " + " AND ".join(conditions) + " ORDER BY t.close_time,t.id", args).fetchall()
        db.commit()
    except Exception:
        db.rollback()
        raise
    trades, excluded = [], {"partial": 0, "needs_review": 0}
    for row in rows:
        if symbol and symbol.upper() not in row["symbol"].upper():
            continue
        if direction and direction != row["direction"]:
            continue
        if row["status"] != "complete" or row["close_time"] is None:
            excluded[row["status"] if row["status"] in excluded else "needs_review"] += 1
            continue
        if start <= row["close_time"] < end:
            item = json.loads(row["payload_json"])
            item["trade_id"] = row["id"]
            item["setup_name"] = row["setup_name"]
            item["playbook_version"] = row["playbook_version"]
            item["execution_score"] = row["execution_score"]
            item["execution_compliance"] = row["execution_compliance"] or "unrated"
            item["tags"] = json.loads(row["tags_json"] or "[]")
            reflection = json.loads(row["reflection_json"] or "{}")
            item["primary_error"] = reflection.get("primary_error") or ("未发现错误" if reflection.get("error_assessment") == "none" else "未评估")
            trades.append(item)
    daily, symbols, setups = defaultdict(list), defaultdict(list), defaultdict(list)
    sessions, tags, errors, executions = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    for trade in trades:
        day = datetime.fromtimestamp(trade["close_time"], timezone.utc).date().isoformat()
        daily[day].append(trade)
        symbols[trade["symbol"]].append(trade)
        setups[trade["setup_name"] or "未关联模型"].append(trade)
        hour = datetime.fromtimestamp(trade["open_time"], timezone.utc).hour
        session = "亚洲时段" if hour < 8 else "伦敦时段" if hour < 13 else "纽约时段" if hour < 22 else "其他时段"
        sessions[session].append(trade)
        for name in trade["tags"]: tags[name].append(trade)
        errors[trade["primary_error"]].append(trade)
        executions[{"compliant": "全部遵守", "violations": "存在违规", "insufficient": "证据不足", "unrated": "未评价"}[trade["execution_compliance"]]].append(trade)
    cumulative = Decimal(0)
    days = []
    for day, items in sorted(daily.items()):
        stats = summarize(items)
        cumulative += sum((Decimal(str(t["net_pnl"])) for t in items), Decimal(0))
        days.append(dict(date=day, **stats, cumulative_pnl=float(cumulative), trades=[
            dict(trade_id=t["trade_id"], symbol=t["symbol"], direction=t["direction"], net_pnl=t["net_pnl"])
            for t in items]))
    return dict(account_id=account_id, tag=tag.strip() if tag else None, review_status=review_status, setup_id=setup_id, execution_status=execution_status, resync_pending=bool(account["resync_pending"]), currency=account["account_currency"], start_date=start_date,
                end_date=end_date, excluded=excluded, summary=summarize(trades), days=days,
                symbols=[dict(symbol=s, **summarize(items)) for s, items in sorted(symbols.items())],
                setups=[dict(setup=name, **summarize(items), scored=sum(t["execution_score"] is not None for t in items),
                             average_score=(sum(t["execution_score"] for t in items if t["execution_score"] is not None) /
                                            sum(t["execution_score"] is not None for t in items) if any(t["execution_score"] is not None for t in items) else None))
                        for name, items in sorted(setups.items())],
                sessions=[dict(name=name, trade_ids=[t["trade_id"] for t in items], **summarize(items)) for name, items in sorted(sessions.items())],
                tags=[dict(name=name, trade_ids=[t["trade_id"] for t in items], **summarize(items)) for name, items in sorted(tags.items(), key=lambda item: (-len(item[1]), item[0]))],
                errors=[dict(name=name, trade_ids=[t["trade_id"] for t in items], **summarize(items)) for name, items in sorted(errors.items(), key=lambda item: (-len(item[1]), item[0]))],
                executions=[dict(name=name, trade_ids=[t["trade_id"] for t in items], **summarize(items)) for name, items in sorted(executions.items())])
