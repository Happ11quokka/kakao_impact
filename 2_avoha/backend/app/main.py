from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.db.base import engine
from app.logging import configure_logging, logger
from app.observability import init_sentry
from app.routes import (
    auth,
    crafting,
    events,
    field,
    health,
    inventory,
    me,
    ops,
    ops_analytics,
    records,
    sse,
    webhook,
)
from app.services.redis import close_redis

configure_logging()
init_sentry()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info("startup", env=settings.ENV, port=settings.PORT, sentry=bool(settings.SENTRY_DSN))
    try:
        yield
    finally:
        await close_redis()
        await engine.dispose()
        logger.info("shutdown complete")


app = FastAPI(title="avoha-backend", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET,
    session_cookie="avoha_sid",
    max_age=60 * 60 * 24 * 7,
    # 프로덕션은 프론트와 백엔드 도메인이 달라서 cross-site fetch(credentials:include)
    # 에 쿠키가 실리려면 SameSite=None + Secure 필요. 로컬은 lax + 평문.
    same_site="none" if settings.is_prod else "lax",
    https_only=settings.is_prod,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        payload = exc.detail
    else:
        payload = {"error": {"message": str(exc.detail), "code": "HTTP_ERROR"}}
    return JSONResponse(status_code=exc.status_code, content=payload)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "message": "INVALID_BODY",
                "code": "INVALID_BODY",
                "issues": exc.errors(),
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled route error", error=str(exc))
    return JSONResponse(
        status_code=500,
        content={"error": {"message": "Internal Server Error", "code": "INTERNAL"}},
    )


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(me.router)
app.include_router(webhook.router)
app.include_router(inventory.router)
app.include_router(crafting.router)
app.include_router(ops.router)
app.include_router(records.router)
app.include_router(sse.router)
app.include_router(events.router)
app.include_router(field.router)
app.include_router(ops_analytics.router)
