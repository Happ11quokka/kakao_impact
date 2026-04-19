from __future__ import annotations

from typing import Any

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import settings

_serializer = URLSafeTimedSerializer(settings.SESSION_SECRET, salt="avoha-bearer")
TOKEN_MAX_AGE_S = 60 * 60 * 24 * 7  # 7일


def issue_token(user_id: str, kakao_id: int) -> str:
    return _serializer.dumps({"userId": user_id, "kakaoId": kakao_id})


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        payload = _serializer.loads(token, max_age=TOKEN_MAX_AGE_S)
    except (BadSignature, SignatureExpired):
        return None
    if isinstance(payload, dict):
        return payload
    return None
