from __future__ import annotations

import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CollectionTicket

KST = ZoneInfo("Asia/Seoul")


def today_kst() -> date:
    return datetime.now(tz=KST).date()


async def get_today_tickets(session: AsyncSession, user_id: uuid.UUID) -> dict[str, object]:
    today = today_kst()

    stmt = (
        pg_insert(CollectionTicket)
        .values(user_id=user_id, date=today, remaining=5)
        .on_conflict_do_nothing(index_elements=["user_id", "date"])
        .returning(CollectionTicket.remaining)
    )
    res = await session.execute(stmt)
    inserted = res.scalar_one_or_none()
    if inserted is not None:
        await session.commit()
        return {"date": today.isoformat(), "remaining": inserted}

    row = await session.execute(
        select(CollectionTicket.remaining)
        .where(CollectionTicket.user_id == user_id)
        .where(CollectionTicket.date == today)
        .limit(1)
    )
    remaining = row.scalar_one_or_none()
    if remaining is None:
        raise RuntimeError("collection_tickets row missing after upsert")
    await session.commit()
    return {"date": today.isoformat(), "remaining": remaining}
