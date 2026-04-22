from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Event, KakaoMessage, User


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
    같은 해시의 미매칭 kakao_messages 를 이 user_id 로 백필. Event 하나 기록.
    한 트랜잭션(begin_nested 로 SAVEPOINT) 이므로 race 안전."""
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
        backfill_res = await session.execute(
            update(KakaoMessage)
            .where(
                KakaoMessage.provider_user_key == key,
                KakaoMessage.user_id.is_(None),
            )
            .values(user_id=user_id)
        )
        backfilled = backfill_res.rowcount or 0
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
    return {
        "prev_user_id": str(prev) if prev else None,
        "backfilled_messages": backfilled,
    }
