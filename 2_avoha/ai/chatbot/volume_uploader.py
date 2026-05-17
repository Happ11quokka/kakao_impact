"""카카오 CDN 사진을 Railway Volume 으로 영구 저장.

설계: docs/superpowers/specs/2026-05-17-chatbot-full-text-log-and-s3-design.md
(원래 S3 설계였으나 Railway Volume 으로 단순화 — 한 플랫폼·한 빌링)

흐름
- 카카오 webhook 으로 받은 임시 URL 을 download
- PHOTO_VOLUME_PATH 아래 photos/<user>/<yyyy>/<mm>/<id>.<ext> 로 저장
- PHOTO_PUBLIC_BASE_URL + 같은 경로 (chatbot 의 /photos StaticFiles 마운트가 서빙) 반환

환경 변수
- PHOTO_VOLUME_PATH      Railway Volume 마운트 디렉터리 (예: /data/photos). 로컬은 ./photos.
- PHOTO_PUBLIC_BASE_URL  외부에서 접근할 base URL
                         예: https://chatbot-production-xxx.up.railway.app/photos
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Tuple
from zoneinfo import ZoneInfo

import requests

PHOTO_VOLUME_PATH = os.getenv("PHOTO_VOLUME_PATH")
PHOTO_PUBLIC_BASE_URL = (os.getenv("PHOTO_PUBLIC_BASE_URL") or "").rstrip("/")

_DOWNLOAD_TIMEOUT_S = 10

_CONTENT_TYPE_TO_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
}


def volume_enabled() -> bool:
    return bool(PHOTO_VOLUME_PATH and PHOTO_PUBLIC_BASE_URL)


def _pick_extension(content_type: str | None, fallback_url: str) -> str:
    if content_type:
        ext = _CONTENT_TYPE_TO_EXT.get(content_type.lower().split(";")[0].strip())
        if ext:
            return ext
    lowered = fallback_url.lower()
    for ext in ("jpg", "jpeg", "png", "gif", "webp"):
        if f".{ext}" in lowered:
            return ext
    return "jpg"


def _build_relative_key(provider_user_key: str, message_id: int | str, ext: str) -> str:
    now = datetime.now(tz=ZoneInfo("Asia/Seoul"))
    safe_uid = (provider_user_key or "unknown").replace("/", "_").replace("\\", "_")
    return f"{safe_uid}/{now:%Y}/{now:%m}/{message_id}.{ext}"


def upload_kakao_photo(
    *,
    kakao_url: str,
    provider_user_key: str,
    message_id: int | str | None = None,
) -> Tuple[str | None, str | None]:
    """카카오 CDN URL → Volume. (public_url, error_message) 반환.

    실패 시 (None, "...") 반환. 호출자는 fallback 으로 카카오 URL 그대로 저장.
    Volume 미설정이면 (None, "volume_not_configured") 반환.
    """
    if not volume_enabled():
        return None, "volume_not_configured"

    try:
        resp = requests.get(kakao_url, timeout=_DOWNLOAD_TIMEOUT_S, stream=True)
        if resp.status_code != 200:
            return None, f"download_http_{resp.status_code}"
        content_type = resp.headers.get("Content-Type", "application/octet-stream")
        body = resp.content
    except Exception as e:  # noqa: BLE001
        return None, f"download_error:{type(e).__name__}:{e}"

    ext = _pick_extension(content_type, kakao_url)
    msg_id = message_id if message_id is not None else uuid.uuid4().hex
    rel_key = _build_relative_key(provider_user_key, msg_id, ext)

    dest = Path(PHOTO_VOLUME_PATH) / rel_key
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            f.write(body)
    except Exception as e:  # noqa: BLE001
        return None, f"write_error:{type(e).__name__}:{e}"

    return f"{PHOTO_PUBLIC_BASE_URL}/{rel_key}", None
