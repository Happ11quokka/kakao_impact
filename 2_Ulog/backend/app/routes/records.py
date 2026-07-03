from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import ChatbotRecord, Event, Gem, User
from app.demo_fallback import demo_records
from app.deps import get_db, require_user
from app.services import sse_bus

router = APIRouter()


CHATBOT_GEM_TO_EMOTION_CODE: dict[str, str] = {
    "뿌듯함 조각": "pride",
    "즐거움 조각": "joy",
    "감사함 조각": "satisfaction",
    "설렘 조각": "flutter",
    "편안함 조각": "serenity",
    "우울함 조각": "sadness",
    "외로움 조각": "sadness",
    "상실감 조각": "sadness",
    "서러움 조각": "sadness",
    "실망감 조각": "sadness",
    "짜증 조각": "annoyance",
    "억울함 조각": "annoyance",
    "화남 조각": "annoyance",
    "적대감 조각": "annoyance",
    "경멸 조각": "annoyance",
    "걱정 조각": "solace",
    "긴장감 조각": "solace",
    "위축감 조각": "solace",
    "초조 조각": "solace",
    "공포 조각": "solace",
    "무기력함 조각": "untroubled",
    "공허함 조각": "solace",
    "후회 조각": "regret",
    "부끄러움 조각": "regret",
    "혼란스러움 조각": "regret",
}


def _iso_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _record_payload(r: object) -> dict[str, object]:
    inferred_emotion = CHATBOT_GEM_TO_EMOTION_CODE.get(r.gem)
    confirmed_emotion = r.confirmed_emotion_code or (
        inferred_emotion if r.classification_status != "needs_confirmation" else None
    )
    gem_emotion = getattr(r, "gem_emotion_code", None) or confirmed_emotion
    raw_codes = getattr(r, "confirmed_emotion_codes", None)
    if raw_codes:
        confirmed_emotion_codes = list(raw_codes)
    elif confirmed_emotion:
        confirmed_emotion_codes = [confirmed_emotion]
    else:
        confirmed_emotion_codes = []
    return {
        "id": r.id,
        "gem": r.gem,
        "recordText": r.record_text,
        "hasPhoto": r.has_photo,
        "imageUrl": r.image_url,
        "aiGems": r.ai_gems,
        "questionId": getattr(r, "question_id", None),
        "questionText": getattr(r, "question_text", None),
        "answerText": getattr(r, "answer_text", None),
        "linkedDate": str(getattr(r, "linked_date", None)) if getattr(r, "linked_date", None) else None,
        "entryMode": r.entry_mode,
        "classificationStatus": r.classification_status,
        "aiEmotionCode": r.ai_emotion_code or inferred_emotion,
        "confirmedEmotionCode": confirmed_emotion,
        "confirmedEmotionCodes": confirmed_emotion_codes,
        "confirmedAt": _iso_utc(r.confirmed_at),
        "webReviewedAt": _iso_utc(r.web_reviewed_at),
        "createdAt": _iso_utc(r.created_at),
        "updatedAt": _iso_utc(r.updated_at),
        "gemId": str(r.gem_id) if getattr(r, "gem_id", None) else None,
        "gemEmotionCode": gem_emotion,
    }


class ConfirmEmotionBody(BaseModel):
    emotionCode: str = Field(min_length=1)
    emotionCodes: list[str] | None = Field(default=None)
    interaction: Literal["confirm", "reclassify"] = "confirm"
    reflectionType: Literal["question", "meditation", "none"] = "none"
    reflectionAnswer: str | None = None


class CreateReflectionBody(BaseModel):
    questionText: str = Field(min_length=1, max_length=500)
    answerText: str = Field(min_length=1, max_length=2000)
    linkedDate: str | None = None  # "YYYY-MM-DD"; 없으면 오늘


@router.get("/demo-status")
async def demo_status() -> dict[str, object]:
    """임시 진단용(무인증): 실행 인스턴스에서 데모 플래그가 켜졌는지 확인.
    데모 검증 후 제거 예정. 민감정보 없음(고정 데모 데이터 개수만)."""
    return {
        "fallbackEnabled": settings.DEMO_RECORDS_FALLBACK,
        "demoRecordCount": len(demo_records()),
    }


@router.get("/records")
async def list_records(
    user_id: uuid.UUID = Depends(require_user),
    limit: int = Query(default=100, ge=1, le=300),
    status_filter: str | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, object]]]:
    provider_key = (
        await session.execute(
            select(User.provider_user_key).where(User.id == user_id).limit(1)
        )
    ).scalar_one_or_none()
    if not provider_key:
        if status_filter is None and settings.DEMO_RECORDS_FALLBACK:
            return {"records": demo_records()}
        return {"records": []}

    stmt = (
        select(
            ChatbotRecord.id,
            ChatbotRecord.gem,
            ChatbotRecord.record_text,
            ChatbotRecord.has_photo,
            ChatbotRecord.image_url,
            ChatbotRecord.ai_gems,
            ChatbotRecord.question_id,
            ChatbotRecord.question_text,
            ChatbotRecord.answer_text,
            ChatbotRecord.linked_date,
            ChatbotRecord.entry_mode,
            ChatbotRecord.classification_status,
            ChatbotRecord.ai_emotion_code,
            ChatbotRecord.confirmed_emotion_code,
            ChatbotRecord.confirmed_emotion_codes,
            ChatbotRecord.confirmed_at,
            ChatbotRecord.web_reviewed_at,
            ChatbotRecord.created_at,
            ChatbotRecord.updated_at,
            Gem.id.label("gem_id"),
            Gem.emotion_code.label("gem_emotion_code"),
        )
        .outerjoin(Gem, Gem.source_chatbot_id == ChatbotRecord.id)
        .where(ChatbotRecord.user_id == provider_key)
        .order_by(desc(ChatbotRecord.created_at))
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(ChatbotRecord.classification_status == status_filter)

    rows = (await session.execute(stmt)).all()
    payloads = [_record_payload(r) for r in rows]
    # 데모 모드: 플래그가 켜져 있으면 (상태필터 없는 일반 조회 한정) 고정 데모 세트를
    # 실제 수집 기록과 **합쳐서** 최신순으로 반환한다(직접 수집한 새 기록도 함께 표시).
    # 데모가 끝나면 플래그를 끄면 실제 데이터만 남는다.
    if status_filter is None and settings.DEMO_RECORDS_FALLBACK:
        merged = demo_records() + payloads
        merged.sort(key=lambda r: r["createdAt"] or "", reverse=True)
        return {"records": merged}
    return {"records": payloads}


@router.post("/records/{record_id}/confirm-emotion")
async def confirm_record_emotion(
    record_id: int,
    body: ConfirmEmotionBody,
    user_id: uuid.UUID = Depends(require_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    provider_key = (
        await session.execute(
            select(User.provider_user_key).where(User.id == user_id).limit(1)
        )
    ).scalar_one_or_none()
    if not provider_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"message": "RECORD_NOT_FOUND", "code": "RECORD_NOT_FOUND"}},
        )

    record = (
        await session.execute(
            select(ChatbotRecord)
            .where(ChatbotRecord.id == record_id)
            .where(ChatbotRecord.user_id == provider_key)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"message": "RECORD_NOT_FOUND", "code": "RECORD_NOT_FOUND"}},
        )

    codes: list[str] = (
        [c for c in body.emotionCodes if c]
        if body.emotionCodes
        else [body.emotionCode]
    )
    if not codes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": {"message": "EMOTION_CODE_REQUIRED", "code": "EMOTION_CODE_REQUIRED"}},
        )
    primary_code = codes[0]

    gem = (
        await session.execute(
            select(Gem)
            .where(Gem.user_id == user_id)
            .where(Gem.source_chatbot_id == record_id)
            .where(Gem.consumed_at.is_(None))
            .limit(1)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if gem is None:
        gem = Gem(
            user_id=user_id,
            emotion_code=primary_code,
            tier=1,
            source="chatbot",
            source_chatbot_id=record_id,
        )
        session.add(gem)
        await session.flush()
    else:
        gem.emotion_code = primary_code

    record.confirmed_emotion_code = primary_code
    record.confirmed_emotion_codes = codes
    if not record.ai_emotion_code:
        record.ai_emotion_code = CHATBOT_GEM_TO_EMOTION_CODE.get(record.gem)
    record.classification_status = (
        "reclassified" if body.interaction == "reclassify" else "user_confirmed"
    )
    now = datetime.now(timezone.utc)
    record.confirmed_at = now
    record.web_reviewed_at = now
    record.updated_at = now
    reflection_answer = (body.reflectionAnswer or "").strip()
    if reflection_answer:
        record.question_text = "이 기록에 대해서 한줄로 표현한다면 어떤 문장일까요?"
        record.answer_text = reflection_answer

    session.add(
        Event(
            user_id=user_id,
            event_type="record_emotion_confirmed",
            props={
                "recordId": record_id,
                "emotionCode": primary_code,
                "emotionCodes": codes,
                "interaction": body.interaction,
                "reflectionType": body.reflectionType,
                "reflectionAnswered": bool(reflection_answer),
            },
        )
    )
    await session.commit()
    await session.refresh(gem)

    sse_bus.publish(
        user_id,
        {
            "type": "record_updated",
            "recordId": record_id,
            "emotionCode": primary_code,
            "emotionCodes": codes,
            "classificationStatus": record.classification_status,
        },
    )

    return {
        "ok": True,
        "record": _record_payload(record),
        "gem": {
            "id": str(gem.id),
            "emotionCode": gem.emotion_code,
            "tier": gem.tier,
            "createdAt": _iso_utc(gem.created_at),
        },
    }


@router.post("/records/reflection")
async def create_self_reflection(
    body: CreateReflectionBody,
    user_id: uuid.UUID = Depends(require_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    provider_key = (
        await session.execute(
            select(User.provider_user_key).where(User.id == user_id).limit(1)
        )
    ).scalar_one_or_none()
    if not provider_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"message": "USER_NOT_LINKED", "code": "USER_NOT_LINKED"}},
        )

    now = datetime.now(timezone.utc)
    linked: date
    if body.linkedDate:
        try:
            linked = date.fromisoformat(body.linkedDate)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": {"message": "INVALID_DATE", "code": "INVALID_DATE"}},
            )
    else:
        linked = now.date()

    record = ChatbotRecord(
        user_id=provider_key,
        gem="자기회고",
        record_text=None,
        has_photo=False,
        image_url=None,
        ai_gems=None,
        question_id=f"self-reflection-{int(now.timestamp())}",
        question_text=body.questionText.strip(),
        answer_text=body.answerText.strip(),
        linked_date=linked,
        entry_mode="plain_record",
        classification_status="user_confirmed",
        ai_emotion_code=None,
        confirmed_emotion_code=None,
        confirmed_emotion_codes=None,
        confirmed_at=now,
        web_reviewed_at=now,
        created_at=now,
        updated_at=now,
    )
    session.add(record)
    await session.flush()

    session.add(
        Event(
            user_id=user_id,
            event_type="self_reflection_created",
            props={
                "recordId": record.id,
                "questionText": record.question_text,
                "linkedDate": linked.isoformat(),
            },
        )
    )

    await session.commit()
    await session.refresh(record)

    sse_bus.publish(
        user_id,
        {
            "type": "record_created",
            "recordId": record.id,
            "kind": "self_reflection",
        },
    )

    return {"ok": True, "record": _record_payload(record)}
