import asyncio
import io
import logging
import os
import time
from dataclasses import dataclass

import mediapipe as mp
from PIL import Image
from rembg import new_session, remove

logger = logging.getLogger("avoha.rembg")

MODEL_NAME = os.getenv("MODEL_NAME", "u2net_lite")
CONFIDENCE_THRESHOLD = 0.5
TIMEOUT_SECONDS = 15

_session = None


def _get_session():
    global _session
    if _session is None:
        _session = new_session(MODEL_NAME)
    return _session


@dataclass
class ProcessResult:
    image_bytes: bytes
    confidence: float
    polaroid_fallback: bool


def _estimate_confidence(original: Image.Image, result: Image.Image) -> float:
    """알파 채널 픽셀 비율로 confidence 추정."""
    if result.mode != "RGBA":
        return 0.3
    alpha = result.split()[3]
    pixels = list(alpha.getdata())
    non_transparent = sum(1 for p in pixels if p > 10)
    total = len(pixels)
    if total == 0:
        return 0.0
    ratio = non_transparent / total
    # 비율이 너무 낮거나(거의 다 제거) 너무 높으면(거의 제거 안 됨) 낮은 confidence
    if ratio < 0.03 or ratio > 0.95:
        return 0.35
    return min(0.95, ratio * 1.2)


def _has_face_only(image: Image.Image) -> bool:
    """mediapipe로 얼굴만 있는 이미지인지 판별."""
    try:
        face_detection = mp.solutions.face_detection
        with face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.7) as fd:
            import numpy as np
            img_array = np.array(image.convert("RGB"))
            results = fd.process(img_array)
            return results.detections is not None and len(results.detections) > 0
    except Exception:
        return False


def _optimize_png(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


async def process_image(image_bytes: bytes) -> ProcessResult:
    loop = asyncio.get_running_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, _run_rembg, image_bytes),
            timeout=TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning("rembg 처리 타임아웃 → 폴백")
        original_img = Image.open(io.BytesIO(image_bytes))
        return ProcessResult(
            image_bytes=_optimize_png(original_img),
            confidence=0.0,
            polaroid_fallback=True,
        )
    return result


def _run_rembg(image_bytes: bytes) -> ProcessResult:
    original = Image.open(io.BytesIO(image_bytes))
    result_bytes = remove(image_bytes, session=_get_session())
    result_img = Image.open(io.BytesIO(result_bytes))

    confidence = _estimate_confidence(original, result_img)
    polaroid_fallback = confidence < CONFIDENCE_THRESHOLD

    if polaroid_fallback and _has_face_only(original):
        # 얼굴만 있는 이미지 — 폴백 없이 head-cutout 반환
        polaroid_fallback = False

    optimized = _optimize_png(result_img)
    return ProcessResult(
        image_bytes=optimized,
        confidence=confidence,
        polaroid_fallback=polaroid_fallback,
    )
