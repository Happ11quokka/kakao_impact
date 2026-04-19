import {
  pgTable,
  uuid,
  text,
  timestamp,
  smallint,
  boolean,
  date,
  bigint,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  kakaoId: bigint("kakao_id", { mode: "number" }).notNull().unique(),
  nickname: text("nickname").notNull(),
  profileUrl: text("profile_url"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  consentVersion: text("consent_version").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const collectionTickets = pgTable(
  "collection_tickets",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    remaining: smallint("remaining").notNull().default(5),
    lastRefilledAt: timestamp("last_refilled_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

// content_type: 'text' | 'image' | 'mixed' (v1.1)
// status: 'pending' | 'proposed' | 'confirmed' | 'rejected'
// provider_*: Kakao Biz 채널 식별자 (OAuth kakao_id 와는 별개; 매핑은 운영 콘솔에서 보정)
export const kakaoMessages = pgTable(
  "kakao_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    contentType: text("content_type").notNull(),
    body: text("body"),
    mediaUrl: text("media_url"),
    status: text("status").notNull().default("pending"),
    aiSuggestion: jsonb("ai_suggestion"),
    operatorId: uuid("operator_id"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id").unique(),
    providerUserKey: text("provider_user_key"),
    raw: jsonb("raw"),
  },
  (t) => [
    index("kakao_messages_status_received_at_idx").on(t.status, t.receivedAt),
    index("kakao_messages_provider_user_key_idx").on(t.providerUserKey),
  ],
);

// category: 'calm' | 'happy' | 'negative' (v1.1)
export const emotions = pgTable("emotions", {
  code: text("code").primaryKey(),
  nameKo: text("name_ko").notNull(),
  category: text("category").notNull(),
  gemName: text("gem_name").notNull(),
  hexColor: text("hex_color").notNull(),
  triggerKeywords: text("trigger_keywords").array(),
});

// source: 'text' | 'photo' (v1.1; 사진·혼합 메시지 유래 표기)
export const gems = pgTable("gems", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  emotionCode: text("emotion_code")
    .notNull()
    .references(() => emotions.code),
  tier: smallint("tier").notNull(),
  sourceMessageId: uuid("source_message_id").references(() => kakaoMessages.id),
  source: text("source"),
  craftedFrom: uuid("crafted_from").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});

export const stickers = pgTable("stickers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sourceMessageId: uuid("source_message_id").references(() => kakaoMessages.id),
  imageUrl: text("image_url").notNull(),
  polaroidFallback: boolean("polaroid_fallback").notNull().default(false),
  placedOnField: boolean("placed_on_field").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  nameKo: text("name_ko").notNull(),
  ingredientCodes: text("ingredient_codes").array().notNull(),
  resultTier: smallint("result_tier").notNull(),
  unlockedBy: text("unlocked_by"),
});

export const craftingEvents = pgTable("crafting_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  ingredientIds: uuid("ingredient_ids").array(),
  resultId: uuid("result_id").references(() => gems.id),
  recipeSlug: text("recipe_slug"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id"),
    eventType: text("event_type").notNull(),
    props: jsonb("props"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("events_event_type_occurred_at_idx").on(t.eventType, t.occurredAt),
    index("events_props_gin_idx").using("gin", t.props),
  ],
);
