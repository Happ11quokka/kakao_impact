from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import settings

KAUTH_BASE = "https://kauth.kakao.com"
KAPI_BASE = "https://kapi.kakao.com"


class KakaoOAuthError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.kakao_code = code
        self.kakao_message = message


@dataclass
class KakaoTokenResponse:
    access_token: str
    token_type: str
    refresh_token: str
    expires_in: int
    scope: str
    refresh_token_expires_in: int


def build_kakao_authorize_url(state: str) -> str:
    query = urlencode(
        {
            "response_type": "code",
            "client_id": settings.KAKAO_REST_API_KEY,
            "redirect_uri": settings.KAKAO_REDIRECT_URI,
            "state": state,
            "scope": "profile_nickname,profile_image",
        }
    )
    return f"{KAUTH_BASE}/oauth/authorize?{query}"


async def exchange_kakao_token(code: str) -> KakaoTokenResponse:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{KAUTH_BASE}/oauth/token",
            headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
            data={
                "grant_type": "authorization_code",
                "client_id": settings.KAKAO_REST_API_KEY,
                "client_secret": settings.KAKAO_CLIENT_SECRET,
                "redirect_uri": settings.KAKAO_REDIRECT_URI,
                "code": code,
            },
        )
    data = _safe_json(resp)
    if resp.status_code >= 400:
        raise KakaoOAuthError(
            str(data.get("error") or resp.status_code),
            str(data.get("error_description") or "unknown"),
        )
    return KakaoTokenResponse(
        access_token=str(data["access_token"]),
        token_type=str(data.get("token_type", "bearer")),
        refresh_token=str(data.get("refresh_token", "")),
        expires_in=int(data.get("expires_in", 0)),
        scope=str(data.get("scope", "")),
        refresh_token_expires_in=int(data.get("refresh_token_expires_in", 0)),
    )


async def fetch_kakao_user_info(access_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{KAPI_BASE}/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code >= 400:
        data = _safe_json(resp)
        raise KakaoOAuthError(
            str(data.get("code") or resp.status_code),
            str(data.get("msg") or "user_info_failed"),
        )
    return _safe_json(resp)


def _safe_json(resp: httpx.Response) -> dict[str, Any]:
    try:
        payload = resp.json()
    except Exception:
        return {}
    if isinstance(payload, dict):
        return payload
    return {}
