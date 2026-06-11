from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import ChatbotRecord, Gem, Sticker, User
from app.demo_fallback import demo_chatbot_records, demo_gems
from app.deps import get_db, require_user


def _iso_utc(dt: datetime | None) -> str | None:
    """timestamp without timezone(Postgres 기본) 컬럼은 naive datetime 으로 오기 때문에
    그대로 isoformat() 하면 'Z' 가 안 붙어 브라우저가 LOCAL 로 파싱한다(KST 기준 9시간
    어긋남). UTC 로 명시해서 'Z' 붙여 반환."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")

router = APIRouter()


@router.get("/inventory/gems")
async def list_gems(
    user_id: uuid.UUID = Depends(require_user),
    emotion: str | None = Query(default=None),
    tier: int | None = Query(default=None, ge=1, le=4),
    session: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, object]]]:
    stmt = (
        select(
            Gem.id,
            Gem.emotion_code,
            Gem.tier,
            Gem.source,
            Gem.source_message_id,
            Gem.source_chatbot_id,
            Gem.crafted_from,
            Gem.created_at,
        )
        .where(Gem.user_id == user_id)
        .where(Gem.consumed_at.is_(None))
        .order_by(desc(Gem.created_at))
    )
    if emotion:
        stmt = stmt.where(Gem.emotion_code == emotion)
    if tier is not None:
        stmt = stmt.where(Gem.tier == tier)

    rows = (await session.execute(stmt)).all()
    payloads = [
        {
            "id": str(r.id),
            "emotionCode": r.emotion_code,
            "tier": r.tier,
            "source": r.source,
            "sourceMessageId": str(r.source_message_id) if r.source_message_id else None,
            "sourceChatbotId": r.source_chatbot_id,
            "craftedFrom": [str(x) for x in (r.crafted_from or [])],
            "createdAt": _iso_utc(r.created_at),
        }
        for r in rows
    ]
    # 데모 모드: 고정 데모 보석 + 실제 수집 보석을 합쳐 최신순 반환(필터 없는 조회 한정).
    if emotion is None and tier is None and settings.DEMO_RECORDS_FALLBACK:
        merged = demo_gems() + payloads
        merged.sort(key=lambda g: g["createdAt"] or "", reverse=True)
        return {"gems": merged}
    return {"gems": payloads}


@router.get("/inventory/chatbot-records")
async def list_chatbot_records(
    user_id: uuid.UUID = Depends(require_user),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, object]]]:
    """챗봇(`ai/chatbot`) 이 직접 INSERT 한 일상 기록을 현재 유저 기준으로 조회.
    users.provider_user_key == chatbot.user_id (= kakao 오픈빌더 해시) 로 JOIN.
    provider_user_key 가 없으면(챗봇 미연결 유저) 빈 배열 반환."""
    stmt = (
        select(
            ChatbotRecord.id,
            ChatbotRecord.gem,
            ChatbotRecord.record_text,
            ChatbotRecord.has_photo,
            ChatbotRecord.image_url,
            ChatbotRecord.ai_gems,
            ChatbotRecord.created_at,
        )
        .join(User, User.provider_user_key == ChatbotRecord.user_id)
        .where(User.id == user_id)
        .where(User.provider_user_key.is_not(None))
        .order_by(desc(ChatbotRecord.created_at))
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    payloads = [
        {
            "id": r.id,
            "gem": r.gem,
            "recordText": r.record_text,
            "hasPhoto": r.has_photo,
            "imageUrl": r.image_url,
            "aiGems": r.ai_gems,
            "createdAt": _iso_utc(r.created_at),
        }
        for r in rows
    ]
    # 데모 모드: 고정 데모 기록 + 실제 수집 기록을 합쳐 최신순 반환.
    if settings.DEMO_RECORDS_FALLBACK:
        merged = demo_chatbot_records() + payloads
        merged.sort(key=lambda r: r["createdAt"] or "", reverse=True)
        return {"records": merged}
    return {"records": payloads}


@router.get("/inventory/stickers")
async def list_stickers(
    user_id: uuid.UUID = Depends(require_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, object]]]:
    rows = (
        await session.execute(
            select(
                Sticker.id,
                Sticker.image_url,
                Sticker.polaroid_fallback,
                Sticker.placed_on_field,
                Sticker.source_message_id,
                Sticker.created_at,
            )
            .where(Sticker.user_id == user_id)
            .order_by(desc(Sticker.created_at))
        )
    ).all()
    return {
        "stickers": [
            {
                "id": str(r.id),
                "imageUrl": r.image_url,
                "polaroidFallback": r.polaroid_fallback,
                "placedOnField": r.placed_on_field,
                "sourceMessageId": str(r.source_message_id) if r.source_message_id else None,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }
