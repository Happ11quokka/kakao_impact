"""patch missing chatbot question/answer columns.

Revision ID: 0009_chatbot_question_columns
Revises: 0008_record_multi_emotion
Create Date: 2026-05-19

Drizzle 로 만든 chatbot 테이블에 question_id/question_text/answer_text/linked_date
컬럼이 빠진 채로 stamp 되어, ORM SELECT(records.py:121-124) 시
asyncpg.UndefinedColumnError 가 발생해 GET /records 가 500 으로 떨어진다.
결과적으로 FE 홈 호수에 챗봇 기록이 표시되지 않음.

이 마이그레이션은 누락된 4 컬럼을 IF NOT EXISTS 로 안전하게 추가한다.
ChatbotRecord ORM 모델(app/db/models.py:213-216)과 일치시킴.
"""

from __future__ import annotations

from alembic import op

revision = "0009_chatbot_question_columns"
down_revision = "0008_record_multi_emotion"
branch_labels = None
depends_on = None


STATEMENTS = [
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "question_id" text',
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "question_text" text',
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "answer_text" text',
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "linked_date" date',
]


def upgrade() -> None:
    for stmt in STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "linked_date"')
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "answer_text"')
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "question_text"')
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "question_id"')
