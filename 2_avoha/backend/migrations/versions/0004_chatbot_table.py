"""chatbot 테이블 추적 — AI 담당(`2_avoha/ai/chatbot/main.py`) 이 직접 INSERT 하는 테이블.

Railway DB 에 이미 수동 생성돼 있을 수 있으므로 `IF NOT EXISTS` 로 idempotent.
스키마는 챗봇의 save_gem() INSERT 문과 정확히 매칭.

Revision ID: 0004_chatbot_table
Revises: 0003_user_provider_user_key
Create Date: 2026-04-23
"""

from __future__ import annotations

from alembic import op

revision = "0004_chatbot_table"
down_revision = "0003_user_provider_user_key"
branch_labels = None
depends_on = None


STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS "chatbot" (
      "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "user_id" text NOT NULL,
      "gem" text NOT NULL,
      "record_text" text,
      "has_photo" boolean NOT NULL DEFAULT false,
      "image_url" text,
      "ai_gems" text,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
    """,
    'CREATE INDEX IF NOT EXISTS "chatbot_user_id_idx" ON "chatbot" ("user_id")',
]


def upgrade() -> None:
    for stmt in STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "chatbot_user_id_idx"')
    op.execute('DROP TABLE IF EXISTS "chatbot"')
