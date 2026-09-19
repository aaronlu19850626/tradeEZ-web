from __future__ import annotations

from app.db import DBConnection, DBRow

from fastapi import APIRouter, Depends, Request
from ..db import get_db
from ..security import get_current_user
from ..schemas import (
    SendCodeIn,
    SendCodeOut,
    VerifyCodeIn,
    VerifyCodeOut,
    UserOut,
)
from . import service

router = APIRouter(tags=["web_auth"])


@router.post("/api/v1/auth/send-code", response_model=SendCodeOut)
def send_login_code(payload: SendCodeIn, request: Request, db: DBConnection = Depends(get_db)) -> SendCodeOut:
    return service.send_login_code(payload, db, request.client.host if request.client else None)


@router.get("/api/v1/auth/config")
def auth_config():
    return {"test_mode": service.settings.test_codes_enabled, "phone_region": "CN"}


@router.post("/api/v1/auth/verify-code", response_model=VerifyCodeOut)
def verify_login_code(payload: VerifyCodeIn, db: DBConnection = Depends(get_db)) -> VerifyCodeOut:
    return service.verify_login_code(payload, db)


@router.get("/api/v1/users/me", response_model=UserOut)
def read_current_user(current_user: DBRow = Depends(get_current_user)) -> UserOut:
    return service.read_current_user(current_user)
