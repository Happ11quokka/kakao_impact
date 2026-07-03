import fc from "fast-check";
import type { ConversationState, ConversationContext } from "@/types";

export const conversationStateArb: fc.Arbitrary<ConversationState> = fc.constantFrom(
  "PHOTO_UPLOADED",
  "VISION_ANALYZING",
  "VISION_FAILED",
  "QUESTION_GENERATED",
  "AWAITING_RESPONSE",
  "SKIP_HIGHLIGHTED",
  "RESPONSE_RECEIVED",
  "SKIPPED",
  "EMOTION_ANALYZING",
  "COMMENT_GENERATING",
  "COMMENT_READY",
  "COMMENT_FAILED",
  "FALLBACK_COMMENT",
  "FALLBACK_SAVE",
  "INSIGHT_DISPLAYED",
  "RECORD_SAVING",
  "COMPLETED"
);

export const conversationContextArb: fc.Arbitrary<ConversationContext> = fc.record({
  imageUrl: fc.option(fc.webUrl(), { nil: null }),
  exifMetadata: fc.option(
    fc.record({
      dateTaken: fc.option(fc.date(), { nil: null }),
      latitude: fc.option(fc.double({ min: 33, max: 39, noNaN: true }), { nil: null }),
      longitude: fc.option(fc.double({ min: 124, max: 132, noNaN: true }), { nil: null }),
    }),
    { nil: null }
  ),
  visionResult: fc.option(
    fc.record({
      visionTags: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
      confidence: fc.double({ min: 0, max: 1, noNaN: true }),
      rawResponse: fc.constant({} as Record<string, unknown>),
    }),
    { nil: null }
  ),
  userText: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
  emotionResult: fc.option(
    fc.record({
      emotionPolarity: fc.constantFrom("positive" as const, "neutral" as const, "negative" as const),
      emotionTags: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
      contextKeywords: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
    }),
    { nil: null }
  ),
  aiComment: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: null }),
  skipFlag: fc.boolean(),
  question: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: null }),
});
