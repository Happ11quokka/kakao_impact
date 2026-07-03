import hashlib
import hmac
import os
import time
import uuid
from pathlib import Path

VOLUME_PATH = os.getenv("VOLUME_PATH", "/data/stickers")
SECRET = os.getenv("SIGNED_URL_SECRET", "dev-secret")
URL_TTL = 86400  # 24시간


def save_sticker(user_id: str, image_bytes: bytes) -> str:
    """PNG를 Volume에 저장하고 파일 경로를 반환."""
    user_dir = Path(VOLUME_PATH) / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    file_name = f"{uuid.uuid4()}.png"
    file_path = user_dir / file_name
    file_path.write_bytes(image_bytes)
    return str(file_path)


def generate_signed_url(file_path: str, user_id: str) -> str:
    """HMAC-SHA256 기반 만료 URL 생성 (24시간)."""
    expires = int(time.time()) + URL_TTL
    relative = file_path.replace(VOLUME_PATH, "").lstrip("/")
    payload = f"{relative}:{expires}"
    sig = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()  # noqa: S324
    return f"/stickers/{relative}?expires={expires}&sig={sig}"


def verify_signed_url(relative_path: str, expires: int, sig: str) -> bool:
    if time.time() > expires:
        return False
    payload = f"{relative_path}:{expires}"
    expected = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()  # noqa: S324
    return hmac.compare_digest(expected, sig)
