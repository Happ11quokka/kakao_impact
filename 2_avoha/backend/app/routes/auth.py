from __future__ import annotations

import secrets
import uuid
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeSerializer
from pydantic import BaseModel, Field
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_db, require_user
from app.logging import logger
from app.services.kakao import (
    KakaoOAuthError,
    build_kakao_authorize_url,
    exchange_kakao_token,
    fetch_kakao_user_info,
)
from app.services.tokens import issue_token
from app.services.users import (
    normalize_provider_user_key,
    set_provider_user_key,
    upsert_kakao_user,
)

router = APIRouter()

# 챗봇 해시를 OAuth state 에 서명해서 실어 보낸다. 세션 쿠키는 PSL/ITP 문제로
# 콜백까지 살아남지 못할 수 있어 state 왕복이 더 신뢰할 수 있음.
_state_signer = URLSafeSerializer(settings.SESSION_SECRET, salt="avoha-oauth-state")


def _redirect_login_error(code: str, reason: str | None = None) -> RedirectResponse:
    query = {"error": code}
    if reason:
        query["reason"] = reason
    target = f"{settings.FRONTEND_URL.rstrip('/')}/login?{urlencode(query)}"
    return RedirectResponse(target, status_code=302)


@router.get("/auth/kakao/login")
async def kakao_login(
    request: Request,
    kakao_hash: str | None = None,
) -> RedirectResponse:
    nonce = secrets.token_hex(16)
    request.session["oauthState"] = nonce
    payload: dict[str, str] = {"n": nonce}
    normalized = normalize_provider_user_key(kakao_hash)
    if normalized:
        payload["h"] = normalized
    state = _state_signer.dumps(payload)
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
    if not state:
        return _redirect_login_error("state_mismatch")

    try:
        payload = _state_signer.loads(state)
    except BadSignature:
        return _redirect_login_error("state_mismatch")
    if not isinstance(payload, dict):
        return _redirect_login_error("state_mismatch")

    nonce = payload.get("n")
    saved_nonce = request.session.pop("oauthState", None)
    if not saved_nonce or saved_nonce != nonce:
        return _redirect_login_error("state_mismatch")

    raw_hash = payload.get("h")
    pending_hash = raw_hash if isinstance(raw_hash, str) else None

    try:
        tok = await exchange_kakao_token(code)
        kakao_user = await fetch_kakao_user_info(tok.access_token)
        user = await upsert_kakao_user(session, kakao_user)
    except KakaoOAuthError as exc:
        logger.warning("kakao oauth error", kakao_code=exc.kakao_code)
        return _redirect_login_error("token_exchange", exc.kakao_code)

    if pending_hash:
        try:
            result = await set_provider_user_key(
                session, user.id, pending_hash, source="oauth_callback"
            )
            logger.info(
                "provider_user_key linked",
                user_id=str(user.id),
                backfilled=result["backfilled_messages"],
                prev_user_id=result["prev_user_id"],
            )
        except Exception as exc:  # partial-unique 충돌/DB 이슈 시 로그인은 계속
            logger.warning(
                "provider_user_key link failed",
                user_id=str(user.id),
                error=str(exc),
            )

    request.session["userId"] = str(user.id)
    request.session["kakaoId"] = user.kakao_id

    # Cross-domain 쿠키 차단(`up.railway.app` PSL) 대응: 서명된 bearer 토큰을
    # URL fragment 로 전달 → 프론트가 localStorage 에 저장 후 Authorization 헤더로 사용.
    token = issue_token(str(user.id), user.kakao_id)

    logger.info("oauth login success", kakao_id=user.kakao_id, user_id=str(user.id))
    return RedirectResponse(
        f"{settings.FRONTEND_URL.rstrip('/')}/login/callback#token={token}",
        status_code=302,
    )


@router.post("/auth/logout")
async def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}


class LinkAnonBody(BaseModel):
    anonId: str = Field(min_length=1, max_length=64)


@router.post("/auth/link-anon")
async def link_anon(
    body: LinkAnonBody,
    user_id: uuid.UUID = Depends(require_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    # 로그인 콜백 직후 프론트가 호출. 같은 anon_id 가 다른 user 에 묶여 있어도
    # 마지막 로그인을 진실로 본다 (ON CONFLICT DO UPDATE).
    await session.execute(
        sql_text(
            """
            INSERT INTO anon_user_links (anon_id, user_id, linked_at)
            VALUES (:anon_id, :user_id, now())
            ON CONFLICT (anon_id) DO UPDATE
              SET user_id = EXCLUDED.user_id, linked_at = EXCLUDED.linked_at
            """
        ),
        {"anon_id": body.anonId.strip(), "user_id": str(user_id)},
    )
    await session.commit()
    return {"ok": True}
