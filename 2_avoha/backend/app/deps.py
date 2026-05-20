from __future__ import annotations

import base64
import hmac
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


def _check_basic_credentials(username: str, password: str) -> bool:
    """timing-safe 비교 — 사용자명/비밀번호 둘 다."""
    u_ok = hmac.compare_digest(username.encode("utf-8"), settings.OPS_BASIC_USERNAME.encode("utf-8"))
    p_ok = hmac.compare_digest(password.encode("utf-8"), settings.OPS_BASIC_PASSWORD.encode("utf-8"))
    return u_ok and p_ok


def _extract_basic_from_header(request: Request) -> tuple[str, str] | None:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("basic "):
        return None
    try:
        raw = base64.b64decode(auth.split(" ", 1)[1].strip()).decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return None
    if ":" not in raw:
        return None
    username, password = raw.split(":", 1)
    return username, password


async def require_admin_basic(request: Request) -> dict[str, str]:
    """분석 대시보드 전용 Basic Auth 게이트 — 카카오 로그인 우회.

    Authorization: Basic <base64(user:pass)> 또는 ?u=&p= query 둘 다 허용.
    EventSource 가 헤더를 못 보내므로 SSE 용 query 폴백 제공.
    """
    creds = _extract_basic_from_header(request)
    if creds is None:
        q_user = request.query_params.get("u")
        q_pass = request.query_params.get("p")
        if q_user and q_pass:
            creds = (q_user, q_pass)
    if creds is None or not _check_basic_credentials(*creds):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"message": "FORBIDDEN", "code": "BASIC_AUTH_REQUIRED"}},
            headers={"WWW-Authenticate": 'Basic realm="ops-analytics"'},
        )
    return {"username": creds[0]}


DbSession = Depends(get_db)
CurrentUserId = Depends(require_user)
CurrentOps = Depends(require_ops)
CurrentAdminBasic = Depends(require_admin_basic)
