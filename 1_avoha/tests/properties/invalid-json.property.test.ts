import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { deserialize } from "@/services/emotion-data-serializer";

describe("Feature: sohwakhaeng-service, Property 12: 잘못된 JSON 입력 시 오류 반환", () => {
  it("유효하지 않은 JSON 문자열에 대해 구체적인 파싱 오류 메시지를 반환한다", () => {
    const invalidJsonArb = fc.oneof(
      fc.string().filter((s) => { try { JSON.parse(s); return false; } catch { return true; } }),
      fc.constant("{invalid}"),
      fc.constant("not json at all"),
      fc.constant("{"),
      fc.constant("")
    );

    fc.assert(
      fc.property(invalidJsonArb, (invalidJson) => {
        expect(() => deserialize(invalidJson)).toThrow();
      }),
      { numRuns: 100 }
    );
  });

  it("필수 필드가 누락된 JSON에 대해 유효성 검증 오류를 반환한다", () => {
    const missingFieldArbs = fc.oneof(
      fc.constant(JSON.stringify({})),
      fc.constant(JSON.stringify({ emotionTags: ["기쁨"] })),
      fc.constant(JSON.stringify({ emotionPolarity: "positive" })),
      fc.constant(JSON.stringify({ emotionTags: [], emotionPolarity: "positive", contextKeywords: [], visionTags: [] }))
    );

    fc.assert(
      fc.property(missingFieldArbs, (json) => {
        expect(() => deserialize(json)).toThrow();
      }),
      { numRuns: 100 }
    );
  });
});
