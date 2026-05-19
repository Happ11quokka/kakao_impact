"""record multi-emotion classification support.

Revision ID: 0008_record_multi_emotion
Revises: 0007_record_flow_state
Create Date: 2026-05-19

ChatbotRecord에 confirmed_emotion_codes JSONB 배열 컬럼 추가.
기존 confirmed_emotion_code (단일) 는 primary (=codes[0]) 로 유지.
Downgrade 시 2번째 이후 emotion 은 영구 손실.
"""

from __future__ import annotations

from alembic import op

revision = "0008_record_multi_emotion"
down_revision = "0007_record_flow_state"
branch_labels = None
depends_on = None


STATEMENTS = [
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "confirmed_emotion_codes" jsonb',
    """
    UPDATE "chatbot"
       SET "confirmed_emotion_codes" = to_jsonb(ARRAY["confirmed_emotion_code"])
     WHERE "confirmed_emotion_code" IS NOT NULL
       AND "confirmed_emotion_codes" IS NULL
    """,
]


def upgrade() -> None:
    for stmt in STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "confirmed_emotion_codes"')
