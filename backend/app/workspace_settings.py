from app.db import DBConnection
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .db import get_db
from .security import get_current_user

router = APIRouter(prefix="/api/v1/my", tags=["workspace-settings"])


class SettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_revision: int = Field(ge=0, strict=True)
    display_timezone: str = Field(max_length=64)
    trading_day_start: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    default_session: str = Field(min_length=1, max_length=40)

    @field_validator("display_timezone")
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError:
            raise ValueError("请输入有效 IANA 时区")
        return value


def output(row):
    if row is None:
        return dict(display_timezone="Asia/Shanghai", trading_day_start="00:00", default_session="全天", revision=0, updated_at=None)
    return {key: row[key] for key in ("display_timezone", "trading_day_start", "default_session", "revision", "updated_at")}


@router.get("/workspace-settings")
def get_workspace_settings(db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    return output(db.execute("SELECT * FROM workspace_settings WHERE user_id=?", (user["id"],)).fetchone())


@router.put("/workspace-settings")
def save_workspace_settings(payload: SettingsInput, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    db.execute("BEGIN IMMEDIATE")
    try:
        old = db.execute("SELECT * FROM workspace_settings WHERE user_id=?", (user["id"],)).fetchone()
        if (old["revision"] if old else 0) != payload.expected_revision:
            raise HTTPException(409, "设置已在其他窗口修改，请重新加载")
        revision = (old["revision"] if old else 0) + 1
        db.execute("""INSERT INTO workspace_settings(user_id,display_timezone,trading_day_start,default_session,revision)
            VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_timezone=excluded.display_timezone,
            trading_day_start=excluded.trading_day_start,default_session=excluded.default_session,revision=excluded.revision,
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')""",
            (user["id"], payload.display_timezone, payload.trading_day_start, payload.default_session, revision))
        saved = db.execute("SELECT * FROM workspace_settings WHERE user_id=?", (user["id"],)).fetchone()
        db.commit()
        return output(saved)
    except Exception:
        db.rollback()
        raise
