import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  createInitialPreferenceVector,
  updatePreferenceVector,
} from "@/services/preference-vector";
import { emotionResultArb } from "../generators/emotion.generator";

describe("Feature: sohwakhaeng-service, Property 7: 취향 벡터 갱신 단조성", () => {
  it("갱신 후 totalRecords는 정확히 1 증가한다", () => {
    fc.assert(
      fc.property(emotionResultArb, (emotionResult) => {
        const initial = createInitialPreferenceVector();
        const updated = updatePreferenceVector(initial, emotionResult);
        expect(updated.totalRecords).toBe(initial.totalRecords + 1);
      }),
      { numRuns: 100 }
    );
  });

  it("새로운 emotionTags가 누적 데이터에 반영된다", () => {
    fc.assert(
      fc.property(emotionResultArb, (emotionResult) => {
        const initial = createInitialPreferenceVector();
        const updated = updatePreferenceVector(initial, emotionResult);

        for (const tag of emotionResult.emotionTags) {
          expect(updated.topEmotionTags).toContain(tag);
          expect(updated.emotionFrequency[tag]).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("새로운 contextKeywords가 누적 데이터에 반영된다", () => {
    fc.assert(
      fc.property(emotionResultArb, (emotionResult) => {
        const initial = createInitialPreferenceVector();
        const updated = updatePreferenceVector(initial, emotionResult);

        for (const kw of emotionResult.contextKeywords) {
          expect(updated.topContextKeywords).toContain(kw);
        }
      }),
      { numRuns: 100 }
    );
  });
});
