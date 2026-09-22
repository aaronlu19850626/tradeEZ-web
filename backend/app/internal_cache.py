from fastapi import APIRouter, Depends

from .internal_timezone import require_internal_token
from .trade_center.cache import cache_stats

router = APIRouter(prefix="/api/v1/internal/cache", tags=["internal-cache"])


@router.get("/stats", dependencies=[Depends(require_internal_token)])
def stats() -> dict:
    return cache_stats()
