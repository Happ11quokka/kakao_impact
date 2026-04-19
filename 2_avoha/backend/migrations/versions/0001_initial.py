"""initial schema (Drizzle 0000_amused_nighthawk 흡수)

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-19
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa  # noqa: F401

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


INITIAL_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS "collection_tickets" (
        "user_id" uuid NOT NULL,
        "date" date NOT NULL,
        "remaining" smallint DEFAULT 5 NOT NULL,
        "last_refilled_at" timestamp with time zone,
        CONSTRAINT "collection_tickets_user_id_date_pk" PRIMARY KEY("user_id","date")
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS "crafting_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid,
        "ingredient_ids" uuid[],
        "result_id" uuid,
        "recipe_slug" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS "emotions" (
        "code" text PRIMARY KEY NOT NULL,
        "name_ko" text NOT NULL,
        "category" text NOT NULL,
        "gem_name" text NOT NULL,
        "hex_color" text NOT NULL,
        "trigger_keywords" text[]
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS "events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid,
        "event_type" text NOT NULL,
        "props" jsonb,
        "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS "gems" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "emotion_code" text NOT NULL,
        "tier" smallint NOT NULL,
        "source_message_id" uuid,
        "source" text,
        "crafted_from" uuid[],
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "consumed_at" timestamp with time zone
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS "kakao_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid,
        "received_at" timestamp with time zone DEFAULT now() NOT NULL,
        "content_type" text NOT NULL,
        "body" text,
        "media_url" text,
        "status" text DEFAULT 'pending' NOT NULL,
        "ai_suggestion" jsonb,
        "operator_id" uuid,
        "finalized_at" timestamp with time zone
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS "recipes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "slug" text NOT NULL,
        "name_ko" text NOT NULL,
        "ingredient_codes" text[] NOT NULL,
        "result_tier" smallint NOT NULL,
        "unlocked_by" text,
        CONSTRAINT "recipes_slug_unique" UNIQUE("slug")
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS "stickers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "source_message_id" uuid,
        "image_url" text NOT NULL,
        "polaroid_fallback" boolean DEFAULT false NOT NULL,
        "placed_on_field" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "kakao_id" bigint NOT NULL,
        "nickname" text NOT NULL,
        "profile_url" text,
        "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
        "consent_version" text NOT NULL,
        "deleted_at" timestamp with time zone,
        CONSTRAINT "users_kakao_id_unique" UNIQUE("kakao_id")
    )
    """,
    """
    DO $$ BEGIN
     ALTER TABLE "collection_tickets" ADD CONSTRAINT "collection_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$
    """,
    """
    DO $$ BEGIN
     ALTER TABLE "crafting_events" ADD CONSTRAINT "crafting_events_result_id_gems_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."gems"("id") ON DELETE no action ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$
    """,
    """
    DO $$ BEGIN
     ALTER TABLE "gems" ADD CONSTRAINT "gems_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$
    """,
    """
    DO $$ BEGIN
     ALTER TABLE "gems" ADD CONSTRAINT "gems_emotion_code_emotions_code_fk" FOREIGN KEY ("emotion_code") REFERENCES "public"."emotions"("code") ON DELETE no action ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$
    """,
    """
    DO $$ BEGIN
     ALTER TABLE "gems" ADD CONSTRAINT "gems_source_message_id_kakao_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."kakao_messages"("id") ON DELETE no action ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$
    """,
    """
    DO $$ BEGIN
     ALTER TABLE "kakao_messages" ADD CONSTRAINT "kakao_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$
    """,
    """
    DO $$ BEGIN
     ALTER TABLE "stickers" ADD CONSTRAINT "stickers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$
    """,
    """
    DO $$ BEGIN
     ALTER TABLE "stickers" ADD CONSTRAINT "stickers_source_message_id_kakao_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."kakao_messages"("id") ON DELETE no action ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$
    """,
    """CREATE INDEX IF NOT EXISTS "events_event_type_occurred_at_idx" ON "events" USING btree ("event_type","occurred_at")""",
    """CREATE INDEX IF NOT EXISTS "events_props_gin_idx" ON "events" USING gin ("props")""",
]


def upgrade() -> None:
    for stmt in INITIAL_STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "events_props_gin_idx"')
    op.execute('DROP INDEX IF EXISTS "events_event_type_occurred_at_idx"')
    for tbl in (
        "crafting_events",
        "events",
        "gems",
        "stickers",
        "collection_tickets",
        "kakao_messages",
        "recipes",
        "emotions",
        "users",
    ):
        op.execute(f'DROP TABLE IF EXISTS "{tbl}" CASCADE')
