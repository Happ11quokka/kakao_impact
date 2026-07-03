"""챗봇 전체 텍스트 로깅 + S3 사진 영구화 지원.

신규 테이블:
- chatbot_messages: webhook 진입 단위 영구 로그 (in/out)
- chatbot_llm_calls: OpenAI 호출 단위 로그 (prompt + raw + parsed)
- chatbot_errors: 잡힌 모든 예외 로그

기존 chatbot 테이블:
- image_url 의미 변경: 카카오 CDN URL → S3 영구 URL
- kakao_image_url 추가: 원본 카카오 CDN URL 백업
- trace_id 추가: chatbot_messages 와 join

설계: docs/superpowers/specs/2026-05-17-chatbot-full-text-log-and-s3-design.md

Revision ID: 0006_chatbot_full_log
Revises: 0005_kakao_messages_cols
Create Date: 2026-05-17
"""

from __future__ import annotations

from alembic import op

revision = "0006_chatbot_full_log"
down_revision = "0005_kakao_messages_cols"
branch_labels = None
depends_on = None


STATEMENTS_UP = [
    """
    CREATE TABLE IF NOT EXISTS "chatbot_messages" (
      "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "user_id" text NOT NULL,
      "trace_id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "direction" text NOT NULL,
      "utterance" text,
      "raw_body" jsonb,
      "callback_url" text,
      "mode" text,
      "pending_state" jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
    """,
    'CREATE INDEX IF NOT EXISTS "chatbot_messages_user_created_idx" ON "chatbot_messages" ("user_id", "created_at" DESC)',
    'CREATE INDEX IF NOT EXISTS "chatbot_messages_trace_idx" ON "chatbot_messages" ("trace_id")',
    """
    CREATE TABLE IF NOT EXISTS "chatbot_llm_calls" (
      "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "trace_id" uuid NOT NULL,
      "user_id" text,
      "call_type" text NOT NULL,
      "model" text NOT NULL,
      "prompt" text NOT NULL,
      "raw_response" jsonb,
      "parsed_result" text,
      "status" text NOT NULL,
      "status_code" integer,
      "error_text" text,
      "latency_ms" integer,
      "attempt" smallint DEFAULT 1,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
    """,
    'CREATE INDEX IF NOT EXISTS "chatbot_llm_calls_trace_idx" ON "chatbot_llm_calls" ("trace_id")',
    'CREATE INDEX IF NOT EXISTS "chatbot_llm_calls_type_created_idx" ON "chatbot_llm_calls" ("call_type", "created_at" DESC)',
    """
    CREATE TABLE IF NOT EXISTS "chatbot_errors" (
      "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "trace_id" uuid,
      "user_id" text,
      "source" text NOT NULL,
      "message" text NOT NULL,
      "traceback" text,
      "context" jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
    """,
    'CREATE INDEX IF NOT EXISTS "chatbot_errors_created_idx" ON "chatbot_errors" ("created_at" DESC)',
    'CREATE INDEX IF NOT EXISTS "chatbot_errors_source_created_idx" ON "chatbot_errors" ("source", "created_at" DESC)',
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "kakao_image_url" text',
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "trace_id" uuid',
    'CREATE INDEX IF NOT EXISTS "chatbot_trace_idx" ON "chatbot" ("trace_id")',
]


STATEMENTS_DOWN = [
    'DROP INDEX IF EXISTS "chatbot_trace_idx"',
    'ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "trace_id"',
    'ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "kakao_image_url"',
    'DROP INDEX IF EXISTS "chatbot_errors_source_created_idx"',
    'DROP INDEX IF EXISTS "chatbot_errors_created_idx"',
    'DROP TABLE IF EXISTS "chatbot_errors"',
    'DROP INDEX IF EXISTS "chatbot_llm_calls_type_created_idx"',
    'DROP INDEX IF EXISTS "chatbot_llm_calls_trace_idx"',
    'DROP TABLE IF EXISTS "chatbot_llm_calls"',
    'DROP INDEX IF EXISTS "chatbot_messages_trace_idx"',
    'DROP INDEX IF EXISTS "chatbot_messages_user_created_idx"',
    'DROP TABLE IF EXISTS "chatbot_messages"',
]


def upgrade() -> None:
    for stmt in STATEMENTS_UP:
        op.execute(stmt)


def downgrade() -> None:
    for stmt in STATEMENTS_DOWN:
        op.execute(stmt)
