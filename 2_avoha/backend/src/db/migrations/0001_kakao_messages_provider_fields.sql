ALTER TABLE "kakao_messages" ADD COLUMN IF NOT EXISTS "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "kakao_messages" ADD COLUMN IF NOT EXISTS "provider_user_key" text;--> statement-breakpoint
ALTER TABLE "kakao_messages" ADD COLUMN IF NOT EXISTS "raw" jsonb;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "kakao_messages" ADD CONSTRAINT "kakao_messages_provider_message_id_unique" UNIQUE("provider_message_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kakao_messages_status_received_at_idx" ON "kakao_messages" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kakao_messages_provider_user_key_idx" ON "kakao_messages" USING btree ("provider_user_key");
