from __future__ import annotations

import uuid
from typing import AsyncIterator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.base import SessionLocal


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def require_user(request: Request) -> uuid.UUID:
    raw = request.session.get("userId")
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"message": "UNAUTHENTICATED", "code": "UNAUTHENTICATED"}},
        )
    try:
        return uuid.UUID(str(raw))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"message": "UNAUTHENTICATED", "code": "UNAUTHENTICATED"}},
        )


async def require_ops(request: Request) -> dict[str, object]:
    user_id_raw = request.session.get("userId")
    kakao_id_raw = request.session.get("kakaoId")
    if not user_id_raw or not kakao_id_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"message": "UNAUTHENTICATED", "code": "UNAUTHENTICATED"}},
        )
    try:
        kakao_id = int(kakao_id_raw)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"message": "UNAUTHENTICATED", "code": "UNAUTHENTICATED"}},
        )
    if kakao_id not in settings.ops_allowed_kakao_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"message": "FORBIDDEN", "code": "NOT_OPS"}},
        )
    return {"userId": uuid.UUID(str(user_id_raw)), "kakaoId": kakao_id}


DbSession = Depends(get_db)
CurrentUserId = Depends(require_user)
CurrentOps = Depends(require_ops)
