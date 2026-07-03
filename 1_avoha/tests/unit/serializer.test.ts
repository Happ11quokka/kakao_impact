import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "@/services/emotion-data-serializer";
import type { EmotionAnalysisData } from "@/types";

describe("EmotionDataSerializer 엣지 케이스", () => {
  it("빈 배열 필드를 가진 데이터도 라운드트립이 동작한다 (visionTags만 빈 배열 허용)", () => {
    const data: EmotionAnalysisData = {
      emotionTags: ["기쁨"],
      emotionPolarity: "positive",
      contextKeywords: ["산책"],
      visionTags: [],
    };
    expect(deserialize(serialize(data))).toEqual(data);
  });

  it("특수 문자 포함 태그도 정상 처리된다", () => {
    const data: EmotionAnalysisData = {
      emotionTags: ["기쁨 & 설렘", "따뜻함<3>"],
      emotionPolarity: "neutral",
      contextKeywords: ["커피\"맛\"", "음악♪"],
      visionTags: ["tag with spaces", "한글/영어"],
    };
    expect(deserialize(serialize(data))).toEqual(data);
  });

  it("매우 긴 문자열도 정상 처리된다", () => {
    const longTag = "a".repeat(1000);
    const data: EmotionAnalysisData = {
      emotionTags: [longTag],
      emotionPolarity: "negative",
      contextKeywords: [longTag],
      visionTags: [longTag],
    };
    expect(deserialize(serialize(data))).toEqual(data);
  });

  it("필수 필드 누락 시 유효성 오류를 반환한다", () => {
    expect(() => deserialize(JSON.stringify({ emotionTags: ["기쁨"] }))).toThrow("유효성 검증 실패");
  });

  it("잘못된 타입 시 유효성 오류를 반환한다", () => {
    expect(() =>
      deserialize(JSON.stringify({
        emotionTags: "not-array",
        emotionPolarity: "positive",
        contextKeywords: ["산책"],
        visionTags: [],
      }))
    ).toThrow("유효성 검증 실패");
  });

  it("잘못된 emotionPolarity 값에 대해 오류를 반환한다", () => {
    expect(() =>
      deserialize(JSON.stringify({
        emotionTags: ["기쁨"],
        emotionPolarity: "invalid",
        contextKeywords: ["산책"],
        visionTags: [],
      }))
    ).toThrow("유효성 검증 실패");
  });

  it("유효하지 않은 JSON 구문에 대해 파싱 오류를 반환한다", () => {
    expect(() => deserialize("{invalid}")).toThrow("JSON 파싱 실패");
  });
});
