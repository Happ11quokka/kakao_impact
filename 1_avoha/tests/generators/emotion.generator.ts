import fc from "fast-check";
import type { EmotionAnalysisData, EmotionResult, VisionResult } from "@/types";
import { emotionPolarityArb, koreanTagArb, contextKeywordArb } from "./record.generator";

export const visionResultArb: fc.Arbitrary<VisionResult> = fc.record({
  visionTags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  rawResponse: fc.constant({}),
});

export const emotionResultArb: fc.Arbitrary<EmotionResult> = fc.record({
  emotionPolarity: emotionPolarityArb,
  emotionTags: fc.array(koreanTagArb, { minLength: 1, maxLength: 5 }),
  contextKeywords: fc.array(contextKeywordArb, { minLength: 1, maxLength: 5 }),
});

export const emotionAnalysisDataArb: fc.Arbitrary<EmotionAnalysisData> = fc.record({
  emotionTags: fc.array(koreanTagArb, { minLength: 1, maxLength: 5 }),
  emotionPolarity: emotionPolarityArb,
  contextKeywords: fc.array(contextKeywordArb, { minLength: 1, maxLength: 5 }),
  visionTags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 10 }),
});
