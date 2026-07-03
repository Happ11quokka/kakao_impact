"""운영자 전용 분석 대시보드 API.

모든 엔드포인트는 require_admin_basic (Basic Auth) 게이트.
KPI 카드는 Redis 카운터 즉시 응답, 시계열·랭킹·funnel 은 Postgres 집계.
모든 집계 쿼리는 OPS_ALLOWED_KAKAO_IDS 운영자 본인 데이터를 제외해서
운영자가 대시보드 보면서 만든 트래픽이 통계를 오염시키지 않게 함.
"""

from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
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


@router.get("/active-users")
async def get_active_users(
    days: int = Query(default=30, ge=1, le=35),
    _admin: dict = Depends(require_admin_basic),
) -> dict[str, object]:
    """DAU 일별 곡선 + trailing WAU(7일) / MAU(30일).

    Redis HyperLogLog 의 multi-key PFCOUNT 로 한 round-trip 에 모두 응답.
    `analytics:daily:uniq:{YYYY-MM-DD}` 키는 35일 보관.
    """
    return await counters.read_active_users_history(days)


@router.get("/pages")
async def get_pages(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    rows = await queries.page_breakdown(session, rng, ops_ids)
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
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "events": await queries.recent_events(session, rng, limit, ops_ids)}


@router.get("/event-types")
async def get_event_type_distribution(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "types": await queries.event_type_distribution(session, rng, ops_ids)}


@router.get("/timeseries")
async def get_timeseries(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "buckets": await queries.hourly_timeseries(session, rng, ops_ids)}


@router.get("/users")
async def get_users(
    rng: Range = Query(default="7d", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "users": await queries.users_ranking(session, rng, ops_ids)}


@router.get("/user-list")
async def get_user_list(
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """등록 사용자 전체 목록 (운영자 제외) — 개인별 드릴다운 진입점."""
    ops_ids = await queries.get_ops_user_ids(session)
    return {"users": await queries.user_directory(session, ops_ids)}


@router.get("/user/{user_id}")
async def get_user_detail(
    user_id: str,
    rng: Range = Query(default="30d", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """한 사용자의 전체 프로필 — 요약·이벤트유형·감정·타임라인·챗봇기록."""
    profile = await queries.user_profile(session, user_id, rng)
    if profile is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"message": "USER_NOT_FOUND", "code": "USER_NOT_FOUND"}},
        )
    return {"range": rng, **profile}


@router.get("/errors")
async def get_errors(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "errors": await queries.error_ranking(session, rng, ops_ids)}


# ─── 챗봇 (ai/chatbot/) 전용 통계 — 같은 Postgres 의 chatbot_* 테이블 직접 SELECT ───
# 챗봇 inbound 은 실제 카카오 사용자 트래픽이라 ops 제외 안 함 (운영자는 보통 카카오에서
# 챗봇 안 씀, 그리고 chatbot.user_id 는 provider_user_key 라 매핑 비용 큼).


@router.get("/chatbot/summary")
async def get_chatbot_summary(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, **(await queries.chatbot_traffic_summary(session, rng))}


@router.get("/chatbot/hourly")
async def get_chatbot_hourly(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, "buckets": await queries.chatbot_hourly(session, rng)}


@router.get("/chatbot/llm")
async def get_chatbot_llm(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, "stats": await queries.chatbot_llm_stats(session, rng)}


@router.get("/chatbot/errors")
async def get_chatbot_errors(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, **(await queries.chatbot_errors(session, rng))}


@router.get("/chatbot/gems")
async def get_chatbot_gems(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, "gems": await queries.chatbot_gem_distribution(session, rng)}


@router.get("/chatbot/users")
async def get_chatbot_users(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return {"range": rng, "users": await queries.chatbot_top_users(session, rng)}


# ─── 사용자 플로우 (events page.view 시퀀스) ───


@router.get("/flow/transitions")
async def get_flow_transitions(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "transitions": await queries.page_transitions(session, rng, ops_ids)}


@router.get("/flow/entry")
async def get_flow_entry(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "pages": await queries.entry_pages(session, rng, ops_ids)}


@router.get("/flow/exit")
async def get_flow_exit(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "pages": await queries.exit_pages(session, rng, ops_ids)}


@router.get("/flow/sequences")
async def get_flow_sequences(
    rng: Range = Query(default="24h", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "sequences": await queries.session_paths_top(session, rng, ops_ids)}


# ─── 감정 기록 분석 (gems × emotions) ───


@router.get("/emotions/distribution")
async def get_emotion_distribution(
    rng: Range = Query(default="7d", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "items": await queries.emotion_distribution(session, rng, ops_ids)}


@router.get("/emotions/by-hour")
async def get_emotion_by_hour(
    rng: Range = Query(default="7d", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "items": await queries.emotion_by_hour(session, rng, ops_ids)}


@router.get("/emotions/by-dow")
async def get_emotion_by_dow(
    rng: Range = Query(default="30d", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "items": await queries.emotion_by_dow(session, rng, ops_ids)}


@router.get("/emotions/by-user")
async def get_emotion_by_user(
    rng: Range = Query(default="30d", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "users": await queries.emotion_by_user(session, rng, ops_ids)}


# ─── 신규 시각화: 디바이스 / 신규-재방문 / Web Vitals ───


@router.get("/devices")
async def get_devices(
    rng: Range = Query(default="7d", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "items": await queries.device_distribution(session, rng, ops_ids)}


@router.get("/new-vs-returning")
async def get_new_vs_returning(
    rng: Range = Query(default="7d", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, **(await queries.new_vs_returning(session, rng, ops_ids))}


@router.get("/web-vitals")
async def get_web_vitals(
    rng: Range = Query(default="7d", alias="range"),
    _admin: dict = Depends(require_admin_basic),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ops_ids = await queries.get_ops_user_ids(session)
    return {"range": rng, "items": await queries.web_vitals_summary(session, rng, ops_ids)}


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
