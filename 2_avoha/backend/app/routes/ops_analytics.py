"""운영자 전용 분석 대시보드 API.

모든 엔드포인트는 require_ops (OPS_ALLOWED_KAKAO_IDS 기반) 게이트.
KPI 카드는 Redis 카운터 즉시 응답, 시계열·랭킹·funnel 은 Postgres 집계.
"""

from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator, Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.analytics import counters, pubsub as analytics_pubsub, queries
from app.deps import get_db, require_admin_basic

router = APIRouter(prefix="/ops/analytics")

Range = Literal["24h", "7d", "30d"]


@router.get("/summary")
async def get_summary(
    _admin: dict = Depends(require_admin_basic),
) -> dict[str, object]:
    return await counters.read_kpi_summary()


@router.get("/pages")
async def get_pages(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    rows = await queries.page_breakdown(session, rng)
    return {"range": rng, "pages": rows}


@router.get("/funnels/chatbot")
async def get_chatbot_funnel(
    rng: Range = Query(default="7d", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, **(await queries.chatbot_funnel(session, rng))}


@router.get("/events")
async def get_recent_events(
    rng: Range = Query(default="24h", alias="range"),
    limit: int = Query(default=200, ge=1, le=500),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, "events": await queries.recent_events(session, rng, limit)}


@router.get("/event-types")
async def get_event_type_distribution(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, "types": await queries.event_type_distribution(session, rng)}


@router.get("/timeseries")
async def get_timeseries(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, "buckets": await queries.hourly_timeseries(session, rng)}


@router.get("/users")
async def get_users(
    rng: Range = Query(default="7d", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, "users": await queries.users_ranking(session, rng)}


@router.get("/errors")
async def get_errors(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, "errors": await queries.error_ranking(session, rng)}


@router.get("/sse")
async def analytics_sse(
    request: Request,
    _admin: dict = Depends(require_admin_basic),
) -> EventSourceResponse:
    # require_admin_basic 가 Authorization 헤더와 ?u=&p= 쿼리 둘 다 허용.
    # EventSource 는 헤더 못 보내므로 프론트가 쿼리로 전달.
    async def event_gen() -> AsyncIterator[dict[str, str]]:
        yield {"data": json.dumps({"type": "hello"})}
        agen = analytics_pubsub.subscribe()
        try:
            async for msg in agen:
                if await request.is_disconnected():
                    break
                yield {"data": json.dumps(msg)}
                await asyncio.sleep(0)
        finally:
            await agen.aclose()

    return EventSourceResponse(event_gen(), ping=25)
