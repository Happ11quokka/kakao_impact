import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  createInitialPreferenceVector,
  updatePreferenceVector,
} from "@/services/preference-vector";
import { emotionResultArb } from "../generators/emotion.generator";

describe("Feature: sohwakhaeng-service, Property 10: 누적 분석 데이터 갱신", () => {
  it("여러 기록 추가 시 totalRecords가 기록 수만큼 증가한다", () => {
    fc.assert(
      fc.property(
        fc.array(emotionResultArb, { minLength: 1, maxLength: 10 }),
        (emotionResults) => {
          let pref = createInitialPreferenceVector();
          for (const er of emotionResults) {
            pref = updatePreferenceVector(pref, er);
          }
          expect(pref.totalRecords).toBe(emotionResults.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("누적된 emotionFrequency가 모든 기록을 반영한다", () => {
    fc.assert(
      fc.property(
        fc.array(emotionResultArb, { minLength: 1, maxLength: 10 }),
        (emotionResults) => {
          let pref = createInitialPreferenceVector();
          for (const er of emotionResults) {
            pref = updatePreferenceVector(pref, er);
          }

          // Check that all emotion tags from all results are in frequency map
          for (const er of emotionResults) {
            for (const tag of er.emotionTags) {
              expect(pref.emotionFrequency[tag]).toBeGreaterThanOrEqual(1);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
