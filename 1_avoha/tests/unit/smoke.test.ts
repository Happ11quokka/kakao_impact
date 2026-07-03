import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sohwakhaengRecordArb } from "../generators/record.generator";
import { emotionAnalysisDataArb } from "../generators/emotion.generator";
import { conversationStateArb } from "../generators/conversation.generator";

describe("Smoke: 생성기 동작 확인", () => {
  it("SohwakhaengRecord 생성기가 유효한 레코드를 생성한다", () => {
    fc.assert(
      fc.property(sohwakhaengRecordArb, (record) => {
        expect(record.id).toBeTruthy();
        expect(record.userId).toBeTruthy();
        expect(record.imageUrl).toBeTruthy();
        expect(record.createdAt).toBeInstanceOf(Date);
        expect(record.emotionTags.length).toBeGreaterThan(0);
        expect(typeof record.skipFlag).toBe("boolean");
      }),
      { numRuns: 50 }
    );
  });

  it("EmotionAnalysisData 생성기가 유효한 데이터를 생성한다", () => {
    fc.assert(
      fc.property(emotionAnalysisDataArb, (data) => {
        expect(data.emotionTags.length).toBeGreaterThan(0);
        expect(["positive", "neutral", "negative"]).toContain(data.emotionPolarity);
        expect(data.contextKeywords.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 }
    );
  });

  it("ConversationState 생성기가 유효한 상태를 생성한다", () => {
    const validStates = new Set([
      "PHOTO_UPLOADED", "VISION_ANALYZING", "VISION_FAILED",
      "QUESTION_GENERATED", "AWAITING_RESPONSE", "SKIP_HIGHLIGHTED",
      "RESPONSE_RECEIVED", "SKIPPED", "EMOTION_ANALYZING",
      "COMMENT_GENERATING", "COMMENT_READY", "COMMENT_FAILED",
      "FALLBACK_COMMENT", "FALLBACK_SAVE", "INSIGHT_DISPLAYED",
      "RECORD_SAVING", "COMPLETED",
    ]);

    fc.assert(
      fc.property(conversationStateArb, (state) => {
        expect(validStates.has(state)).toBe(true);
      }),
      { numRuns: 50 }
    );
  });
});
