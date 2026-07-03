import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { EmotionExtractionService } from "@/services/emotion-extraction-service";
import { visionResultArb } from "../generators/emotion.generator";

const service = new EmotionExtractionService();

describe("Feature: sohwakhaeng-service, Property 6: 감정 분석 결과 구조 무결성", () => {
  it("VisionResult + userText로 분석 시 유효한 EmotionResult 구조 반환", () => {
    fc.assert(
      fc.asyncProperty(
        visionResultArb,
        fc.string({ minLength: 1, maxLength: 200 }),
        async (visionResult, userText) => {
          const result = await service.extractWithText(visionResult, userText);
          expect(["positive", "neutral", "negative"]).toContain(result.emotionPolarity);
          expect(result.emotionTags.length).toBeGreaterThan(0);
          expect(result.contextKeywords.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("VisionResult만으로 분석 시 유효한 EmotionResult 구조 반환", () => {
    fc.assert(
      fc.asyncProperty(visionResultArb, async (visionResult) => {
        const result = await service.extractFromVisionOnly(visionResult);
        expect(["positive", "neutral", "negative"]).toContain(result.emotionPolarity);
        expect(result.emotionTags.length).toBeGreaterThan(0);
        expect(result.contextKeywords.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
