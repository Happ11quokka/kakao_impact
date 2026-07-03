import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { emotionAnalysisDataArb } from "../generators/emotion.generator";
import { serialize, deserialize } from "@/services/emotion-data-serializer";

describe("Feature: sohwakhaeng-service, Property 11: 감정 분석 데이터 직렬화 라운드트립", () => {
  it("serialize 후 deserialize하면 원본 객체와 동일한 결과를 생성한다", () => {
    fc.assert(
      fc.property(emotionAnalysisDataArb, (data) => {
        const serialized = serialize(data);
        const deserialized = deserialize(serialized);
        expect(deserialized).toEqual(data);
      }),
      { numRuns: 100 }
    );
  });
});
