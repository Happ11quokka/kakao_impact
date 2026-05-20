from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    Date,
    DateTime,
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
    provider_user_key: Mapped[str | None] = mapped_column(Text)


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
    source_chatbot_id: Mapped[int | None] = mapped_column(BigInteger)
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


class ChatbotRecord(Base):
    """챗봇(`2_avoha/ai/chatbot`) 이 직접 INSERT 하는 테이블. user_id 는 오픈빌더 해시
    (= users.provider_user_key) 이며 앱의 users/gems 와는 JOIN 으로 이어진다.

    image_url: S3 영구 URL. 카카오 CDN URL 은 kakao_image_url 에 백업.
    trace_id: chatbot_messages.trace_id 와 매핑."""

    __tablename__ = "chatbot"
    __table_args__ = (
        Index("chatbot_user_id_idx", "user_id"),
        Index("chatbot_trace_idx", "trace_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    gem: Mapped[str] = mapped_column(Text, nullable=False)
    record_text: Mapped[str | None] = mapped_column(Text)
    has_photo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    image_url: Mapped[str | None] = mapped_column(Text)
    ai_gems: Mapped[str | None] = mapped_column(Text)
    question_id: Mapped[str | None] = mapped_column(Text)
    question_text: Mapped[str | None] = mapped_column(Text)
    answer_text: Mapped[str | None] = mapped_column(Text)
    linked_date: Mapped[date | None] = mapped_column(Date)
    entry_mode: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'emotion_classification'")
    )
    classification_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'user_confirmed'")
    )
    ai_emotion_code: Mapped[str | None] = mapped_column(Text)
    confirmed_emotion_code: Mapped[str | None] = mapped_column(Text)
    confirmed_emotion_codes: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    web_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    kakao_image_url: Mapped[str | None] = mapped_column(Text)
    trace_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class ChatbotMessage(Base):
    """챗봇 webhook 진입 단위 영구 로그. 사용자 발화·봇 응답을 빠짐없이 저장.

    trace_id: webhook 1회 = 1 trace_id. 같은 trace 안에서 llm_calls / errors 와 join.
    direction: 'inbound' | 'outbound'."""

    __tablename__ = "chatbot_messages"
    __table_args__ = (
        Index("chatbot_messages_user_created_idx", "user_id", "created_at"),
        Index("chatbot_messages_trace_idx", "trace_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    trace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    direction: Mapped[str] = mapped_column(Text, nullable=False)
    utterance: Mapped[str | None] = mapped_column(Text)
    raw_body: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    callback_url: Mapped[str | None] = mapped_column(Text)
    mode: Mapped[str | None] = mapped_column(Text)
    pending_state: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )


class ChatbotLLMCall(Base):
    """챗봇이 OpenAI 를 호출한 모든 기록. prompt + raw + parsed + status/latency."""

    __tablename__ = "chatbot_llm_calls"
    __table_args__ = (
        Index("chatbot_llm_calls_trace_idx", "trace_id"),
        Index("chatbot_llm_calls_type_created_idx", "call_type", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    trace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    user_id: Mapped[str | None] = mapped_column(Text)
    call_type: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    raw_response: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    parsed_result: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer)
    error_text: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    attempt: Mapped[int | None] = mapped_column(SmallInteger, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )


class ChatbotError(Base):
    """챗봇에서 잡힌 모든 예외 영구 보존."""

    __tablename__ = "chatbot_errors"
    __table_args__ = (
        Index("chatbot_errors_created_idx", "created_at"),
        Index("chatbot_errors_source_created_idx", "source", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    trace_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    user_id: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    traceback: Mapped[str | None] = mapped_column(Text)
    context: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("events_event_type_occurred_at_idx", "event_type", "occurred_at"),
        Index("events_props_gin_idx", "props", postgresql_using="gin"),
        Index("events_user_id_occurred_at_idx", "user_id", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    props: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    occurred_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )


class AnonUserLink(Base):
    __tablename__ = "anon_user_links"

    anon_id: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    linked_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        nullable=False,
    )
