from __future__ import annotations

import uuid
from typing import AsyncIterator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.base import SessionLocal
from app.services.tokens import decode_token


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


def _extract_bearer(request: Request) -> dict[str, object] | None:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    payload = decode_token(token)
    if not payload:
        return None
    return payload


def _extract_session(request: Request) -> dict[str, object] | None:
    user_id = request.session.get("userId")
    if not user_id:
        return None
    return {"userId": user_id, "kakaoId": request.session.get("kakaoId")}


def _identity(request: Request) -> dict[str, object] | None:
    # 1) Authorization: Bearer <token> (크로스 도메인 호환)
    # 2) 세션 쿠키 (같은 도메인이거나 OAuth 플로우 내부)
    return _extract_bearer(request) or _extract_session(request)


async def require_user(request: Request) -> uuid.UUID:
    ident = _identity(request)
    if not ident or not ident.get("userId"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"message": "UNAUTHENTICATED", "code": "UNAUTHENTICATED"}},
        )
    try:
        return uuid.UUID(str(ident["userId"]))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"message": "UNAUTHENTICATED", "code": "UNAUTHENTICATED"}},
        )


async def optional_user(request: Request) -> uuid.UUID | None:
    # 익명 이벤트(로그인 전 page.view 등)를 받기 위한 soft auth.
    ident = _identity(request)
    raw = ident.get("userId") if ident else None
    if not raw:
        return None
    try:
        return uuid.UUID(str(raw))
    except ValueError:
        return None


async def require_ops(request: Request) -> dict[str, object]:
    ident = _identity(request)
    if not ident or not ident.get("userId") or not ident.get("kakaoId"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"message": "UNAUTHENTICATED", "code": "UNAUTHENTICATED"}},
        )
    try:
        kakao_id = int(ident["kakaoId"])  # type: ignore[arg-type]
        user_id = uuid.UUID(str(ident["userId"]))
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
    return {"userId": user_id, "kakaoId": kakao_id}


DbSession = Depends(get_db)
CurrentUserId = Depends(require_user)
CurrentOps = Depends(require_ops)
