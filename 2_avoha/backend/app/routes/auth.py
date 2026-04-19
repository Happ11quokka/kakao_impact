from __future__ import annotations

import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_db
from app.logging import logger
from app.services.kakao import (
    KakaoOAuthError,
    build_kakao_authorize_url,
    exchange_kakao_token,
    fetch_kakao_user_info,
)
from app.services.users import upsert_kakao_user

router = APIRouter()


def _redirect_login_error(code: str, reason: str | None = None) -> RedirectResponse:
    query = {"error": code}
    if reason:
        query["reason"] = reason
    target = f"{settings.FRONTEND_URL.rstrip('/')}/login?{urlencode(query)}"
    return RedirectResponse(target, status_code=302)


@router.get("/auth/kakao/login")
async def kakao_login(request: Request) -> RedirectResponse:
    state = secrets.token_hex(16)
    request.session["oauthState"] = state
    return RedirectResponse(build_kakao_authorize_url(state), status_code=302)


@router.get("/auth/kakao/callback")
async def kakao_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    session: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    if error:
        return _redirect_login_error(error, error_description)
    if not code:
        return _redirect_login_error("missing_code")

    saved_state = request.session.get("oauthState")
    if not saved_state or saved_state != state:
        return _redirect_login_error("state_mismatch")
    request.session.pop("oauthState", None)

    try:
        tok = await exchange_kakao_token(code)
        kakao_user = await fetch_kakao_user_info(tok.access_token)
        user = await upsert_kakao_user(session, kakao_user)
    except KakaoOAuthError as exc:
        logger.warning("kakao oauth error", kakao_code=exc.kakao_code)
        return _redirect_login_error("token_exchange", exc.kakao_code)

    request.session["userId"] = str(user.id)
    request.session["kakaoId"] = user.kakao_id

    logger.info("oauth login success", kakao_id=user.kakao_id, user_id=str(user.id))
    return RedirectResponse(
        f"{settings.FRONTEND_URL.rstrip('/')}/login/callback",
        status_code=302,
    )


@router.post("/auth/logout")
async def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}
