from __future__ import annotations

import hmac
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import Event, KakaoMessage, User
from app.deps import get_db
from app.logging import logger

router = APIRouter()


def _verify_secret(provided: str | None) -> bool:
    if not settings.KAKAO_WEBHOOK_SECRET:
        return True
    if not provided:
        return False
    return hmac.compare_digest(provided, settings.KAKAO_WEBHOOK_SECRET)


def _pick_str(*candidates: Any) -> str | None:
    for c in candidates:
        if isinstance(c, str) and c:
            return c
        if isinstance(c, (int, float)):
            return str(c)
    return None


def _normalize(raw: dict[str, Any]) -> dict[str, Any]:
    user_request = raw.get("userRequest") if isinstance(raw.get("userRequest"), dict) else {}
    user_obj = user_request.get("user") if isinstance(user_request.get("user"), dict) else {}
    content = raw.get("content") if isinstance(raw.get("content"), dict) else {}
    data = raw.get("data") if isinstance(raw.get("data"), dict) else {}

    provider_message_id = _pick_str(raw.get("messageId"), data.get("messageId"))
    provider_user_key = _pick_str(
        raw.get("userKey"),
        user_obj.get("id"),
        data.get("userKey"),
    )
    body_text = _pick_str(
        content.get("text"),
        user_request.get("utterance"),
        data.get("text"),
    )
    media_url = _pick_str(
        content.get("imageUrl"),
        content.get("mediaUrl"),
        data.get("imageUrl"),
    )

    if body_text and media_url:
        content_type: Literal["text", "image", "mixed"] = "mixed"
    elif media_url:
        content_type = "image"
    else:
        content_type = "text"

    return {
        "providerMessageId": provider_message_id,
        "providerUserKey": provider_user_key,
        "contentType": content_type,
        "body": body_text,
        "mediaUrl": media_url,
    }


@router.post("/webhook/kakao")
async def webhook_kakao(
    request: Request,
    x_avoha_webhook_secret: str | None = Header(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if not _verify_secret(x_avoha_webhook_secret):
        logger.warning("webhook secret mismatch", ip=request.client.host if request.client else None)
        raise HTTPException(status_code=401, detail={"ok": False, "error": "secret_mismatch"})

    try:
        raw = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "invalid_body"})
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail={"ok": False, "error": "invalid_body"})

    normalized = _normalize(raw)

    if normalized["providerMessageId"]:
        existing_id = (
            await session.execute(
                select(KakaoMessage.id)
                .where(KakaoMessage.provider_message_id == normalized["providerMessageId"])
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing_id is not None:
            logger.info(
                "webhook duplicate",
                provider_message_id=normalized["providerMessageId"],
                db_id=str(existing_id),
            )
            return {"ok": True, "duplicate": True, "id": str(existing_id)}

    row = KakaoMessage(
        provider_message_id=normalized["providerMessageId"],
        provider_user_key=normalized["providerUserKey"],
        content_type=normalized["contentType"],
        body=normalized["body"],
        media_url=normalized["mediaUrl"],
        status="pending",
        raw=raw,
    )
    session.add(row)
    await session.flush()

    # 분석용 이벤트: 챗봇 inbound 1건. utterance 원문은 chatbot_messages 에
    # 이미 있으므로 props 에는 길이/타입만 기록 (프라이버시).
    provider_key = normalized["providerUserKey"]
    matched_user_id = None
    if provider_key:
        matched_user_id = (
            await session.execute(
                select(User.id).where(User.provider_user_key == provider_key).limit(1)
            )
        ).scalar_one_or_none()
    session.add(
        Event(
            user_id=matched_user_id,
            event_type="chatbot.question.sent",
            props={
                "contentType": normalized["contentType"],
                "bodyLength": len(normalized["body"] or ""),
                "hasMedia": bool(normalized["mediaUrl"]),
                "providerUserKey": provider_key,
                "messageId": str(row.id),
            },
        )
    )
    await session.commit()
    await session.refresh(row)

    # 큐 발행은 이후 arq 워커 도입 시 추가.
    logger.info(
        "webhook ingested",
        id=str(row.id),
        provider_message_id=normalized["providerMessageId"],
        content_type=normalized["contentType"],
    )
    return {"ok": True, "id": str(row.id)}
