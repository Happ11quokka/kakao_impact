from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Response, status
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import SessionLocal
from app.services.redis import get_app_redis

router = APIRouter()


async def _timed_db() -> dict[str, Any]:
    start = time.perf_counter()
    try:
        async with SessionLocal() as session:  # type: AsyncSession
            await session.execute(sql_text("SELECT 1"))
        return {"ok": True, "ms": int((time.perf_counter() - start) * 1000)}
    except Exception as exc:
        return {
            "ok": False,
            "ms": int((time.perf_counter() - start) * 1000),
            "error": str(exc) or "unknown",
        }


async def _timed_redis() -> dict[str, Any]:
    start = time.perf_counter()
    try:
        await get_app_redis().ping()
        return {"ok": True, "ms": int((time.perf_counter() - start) * 1000)}
    except Exception as exc:
        return {
            "ok": False,
            "ms": int((time.perf_counter() - start) * 1000),
            "error": str(exc) or "unknown",
        }


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def ready(response: Response) -> dict[str, Any]:
    db_check = await _timed_db()
    redis_check = await _timed_redis()
    ok = db_check["ok"] and redis_check["ok"]
    response.status_code = status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ready" if ok else "degraded",
        "checks": {"db": db_check, "redis": redis_check},
    }
