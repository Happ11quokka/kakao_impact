from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Event, KakaoMessage, User
from app.logging import logger


async def upsert_kakao_user(session: AsyncSession, kakao_user: dict[str, Any]) -> User:
    kakao_id = int(kakao_user["id"])
    profile = (kakao_user.get("kakao_account") or {}).get("profile") or {}
    nickname = profile.get("nickname") or "아보하 친구"
    is_default_image = bool(profile.get("is_default_image"))
    profile_url = None if is_default_image else profile.get("profile_image_url")

    stmt = (
        pg_insert(User)
        .values(
            kakao_id=kakao_id,
            nickname=nickname,
            profile_url=profile_url,
            consent_version="v2026.04",
        )
        .on_conflict_do_update(
            index_elements=["kakao_id"],
            set_={"nickname": nickname, "profile_url": profile_url},
        )
        .returning(User)
    )
    res = await session.execute(stmt)
    user = res.scalar_one()
    await session.commit()
    return user


PROVIDER_USER_KEY_RE = re.compile(r"^[0-9a-f]{32,128}$")


def normalize_provider_user_key(raw: str | None) -> str | None:
    """오픈빌더 채널 해시 정규화. 소문자 16진수 32~128자만 허용.
    None 또는 형식 불일치면 None 반환."""
    if not raw:
        return None
    cleaned = raw.strip().lower()
    if not PROVIDER_USER_KEY_RE.match(cleaned):
        return None
    return cleaned


async def set_provider_user_key(
    session: AsyncSession,
    user_id: uuid.UUID,
    key: str,
    source: str,
) -> dict[str, object]:
    """유저 ↔ 챗봇 해시 1:1 매핑. 다른 유저에 물려있으면 기존을 NULL 로 내리고 덮어씀.
    (핵심) users.provider_user_key 업데이트는 반드시 성공해야 함.
    (보조) kakao_messages 백필 + Event 기록은 실패해도 swallow → OAuth/로그인 못 막게.

    핵심과 보조를 별도 트랜잭션으로 분리해서 보조 작업 실패가 핵심에 전파되지 않게
    한다(예: Railway DB 가 Drizzle 로 만들어져 kakao_messages.provider_user_key 가
    없는 상황)."""
    # ── 핵심: users 업데이트 (실패 시 예외 전파) ──
    async with session.begin_nested():
        prev = (
            await session.execute(
                select(User.id).where(
                    User.provider_user_key == key,
                    User.id != user_id,
                )
            )
        ).scalar_one_or_none()
        if prev is not None:
            await session.execute(
                update(User).where(User.id == prev).values(provider_user_key=None)
            )
        await session.execute(
            update(User).where(User.id == user_id).values(provider_user_key=key)
        )
    await session.commit()

    # ── 보조: kakao_messages 백필 (실패해도 진행) ──
    backfilled = 0
    try:
        res = await session.execute(
            update(KakaoMessage)
            .where(
                KakaoMessage.provider_user_key == key,
                KakaoMessage.user_id.is_(None),
            )
            .values(user_id=user_id)
        )
        await session.commit()
        backfilled = res.rowcount or 0
    except SQLAlchemyError as exc:
        await session.rollback()
        logger.warning(
            "kakao_messages backfill skipped",
            user_id=str(user_id),
            key=key,
            reason=str(exc).splitlines()[0][:200],
        )

    # ── 보조: Event 기록 (실패해도 진행) ──
    try:
        session.add(
            Event(
                user_id=user_id,
                event_type="provider_user_key_linked",
                props={
                    "source": source,
                    "prev_user_id": str(prev) if prev else None,
                    "backfilled_messages": backfilled,
                },
            )
        )
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        logger.warning(
            "provider_user_key_linked event skipped",
            user_id=str(user_id),
            reason=str(exc).splitlines()[0][:200],
        )

    return {
        "prev_user_id": str(prev) if prev else None,
        "backfilled_messages": backfilled,
    }
