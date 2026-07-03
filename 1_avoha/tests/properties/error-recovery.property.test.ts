import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ConversationStateManager } from "@/services/conversation-state-manager";

describe("Feature: sohwakhaeng-service, Property 8: 오류 시 데이터 보존 및 복구", () => {
  it("Vision API 오류 후에도 imageUrl, exifMetadata가 보존된다", () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.record({
          dateTaken: fc.option(fc.date(), { nil: null }),
          latitude: fc.option(fc.double({ min: 33, max: 39, noNaN: true }), { nil: null }),
          longitude: fc.option(fc.double({ min: 124, max: 132, noNaN: true }), { nil: null }),
        }),
        (imageUrl, exif) => {
          const mgr = new ConversationStateManager("PHOTO_UPLOADED");

          mgr.transition({ type: "PHOTO_UPLOAD_COMPLETE", imageUrl, exif });
          mgr.transition({ type: "VISION_ANALYSIS_FAILED", error: new Error("API error") });

          const ctx = mgr.getContext();
          expect(ctx.imageUrl).toBe(imageUrl);
          expect(ctx.exifMetadata).toEqual(exif);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("코멘트 생성 오류 후에도 기존 컨텍스트 데이터가 보존된다", () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.string({ minLength: 1, maxLength: 100 }),
        (imageUrl, userText) => {
          const mgr = new ConversationStateManager("PHOTO_UPLOADED");

          mgr.transition({
            type: "PHOTO_UPLOAD_COMPLETE",
            imageUrl,
            exif: { dateTaken: null, latitude: null, longitude: null },
          });
          mgr.transition({
            type: "VISION_ANALYSIS_COMPLETE",
            result: { visionTags: ["test"], confidence: 0.8, rawResponse: {} },
          });
          mgr.transition({ type: "USER_RESPONSE", text: userText });
          mgr.transition({
            type: "EMOTION_ANALYSIS_COMPLETE",
            result: { emotionPolarity: "positive", emotionTags: ["기쁨"], contextKeywords: ["산책"] },
          });
          mgr.transition({ type: "COMMENT_GENERATION_FAILED", error: new Error("fail") });

          const ctx = mgr.getContext();
          expect(ctx.imageUrl).toBe(imageUrl);
          expect(ctx.userText).toBe(userText);
          expect(ctx.emotionResult).toBeTruthy();
        }
      ),
      { numRuns: 100 }
    );
  });
});
