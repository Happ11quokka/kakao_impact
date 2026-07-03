import logging
import os
from contextlib import asynccontextmanager

import psutil
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .processor import process_image
from .storage import generate_signed_url, save_sticker

logging.basicConfig(level=os.getenv("LOG_LEVEL", "info").upper())
logger = logging.getLogger("avoha.rembg")

MAX_IMAGE_MB = int(os.getenv("MAX_IMAGE_MB", "10"))
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    from .processor import _get_session
    _get_session()
    logger.info("rembg 모델 로드 완료")
    yield


app = FastAPI(title="avoha-rembg", lifespan=lifespan)


class RemoveBgResponse(BaseModel):
    url: str
    polaroid_fallback: bool
    confidence: float


@app.post("/remove-bg", response_model=RemoveBgResponse)
async def remove_bg(
    file: UploadFile = File(...),
    user_id: str = Form(default="anonymous"),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"지원하지 않는 이미지 형식: {file.content_type}")

    image_bytes = await file.read()

    if len(image_bytes) > MAX_IMAGE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"이미지 크기 {MAX_IMAGE_MB}MB 초과")

    result = await process_image(image_bytes)

    file_path = save_sticker(user_id, result.image_bytes)
    url = generate_signed_url(file_path, user_id)

    logger.info(
        "remove-bg 완료",
        extra={"user_id": user_id, "confidence": result.confidence, "fallback": result.polaroid_fallback},
    )

    return RemoveBgResponse(
        url=url,
        polaroid_fallback=result.polaroid_fallback,
        confidence=result.confidence,
    )


@app.get("/healthz")
async def healthz():
    mem = psutil.virtual_memory()
    return JSONResponse({
        "status": "ok",
        "memory_percent": mem.percent,
        "memory_available_mb": mem.available // (1024 * 1024),
    })
