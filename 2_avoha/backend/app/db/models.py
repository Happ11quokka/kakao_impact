from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    kakao_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    nickname: Mapped[str] = mapped_column(Text, nullable=False)
    profile_url: Mapped[str | None] = mapped_column(Text)
    joined_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )
    consent_version: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_at: Mapped[datetime | None]


class CollectionTicket(Base):
    __tablename__ = "collection_tickets"
    __table_args__ = (
        PrimaryKeyConstraint("user_id", "date", name="collection_tickets_user_id_date_pk"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    remaining: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("5"))
    last_refilled_at: Mapped[datetime | None]


class KakaoMessage(Base):
    __tablename__ = "kakao_messages"
    __table_args__ = (
        Index("kakao_messages_status_received_at_idx", "status", "received_at"),
        Index("kakao_messages_provider_user_key_idx", "provider_user_key"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
    )
    received_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    media_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pending'"))
    ai_suggestion: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    operator_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    finalized_at: Mapped[datetime | None]
    provider_message_id: Mapped[str | None] = mapped_column(Text, unique=True)
    provider_user_key: Mapped[str | None] = mapped_column(Text)
    raw: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class Emotion(Base):
    __tablename__ = "emotions"

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    name_ko: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    gem_name: Mapped[str] = mapped_column(Text, nullable=False)
    hex_color: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_keywords: Mapped[list[str] | None] = mapped_column(ARRAY(Text))


class Gem(Base):
    __tablename__ = "gems"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    emotion_code: Mapped[str] = mapped_column(
        Text,
        ForeignKey("emotions.code"),
        nullable=False,
    )
    tier: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    source_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("kakao_messages.id"),
    )
    source: Mapped[str | None] = mapped_column(Text)
    crafted_from: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(UUID(as_uuid=True)))
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )
    consumed_at: Mapped[datetime | None]


class Sticker(Base):
    __tablename__ = "stickers"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("kakao_messages.id"),
    )
    image_url: Mapped[str] = mapped_column(Text, nullable=False)
    polaroid_fallback: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    placed_on_field: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[uuid.UUID] = _uuid_pk()
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    name_ko: Mapped[str] = mapped_column(Text, nullable=False)
    ingredient_codes: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    result_tier: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    unlocked_by: Mapped[str | None] = mapped_column(Text)


class CraftingEvent(Base):
    __tablename__ = "crafting_events"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    ingredient_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(UUID(as_uuid=True)))
    result_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("gems.id"),
    )
    recipe_slug: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("events_event_type_occurred_at_idx", "event_type", "occurred_at"),
        Index("events_props_gin_idx", "props", postgresql_using="gin"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    props: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    occurred_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )
