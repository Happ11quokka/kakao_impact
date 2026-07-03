import { describe, it, expect } from "vitest";
import { CommentGenerationService } from "@/services/comment-generation-service";

const mockClient = { generateComment: async (p: string) => `코멘트: ${p.slice(0, 10)}` };
const service = new CommentGenerationService(mockClient);

describe("대체 코멘트 테스트", () => {
  it("빈 emotionTags로 호출 시 비어있지 않은 문자열 반환", () => {
    const result = service.getFallbackComment([]);
    expect(result.length).toBeGreaterThan(0);
  });

  it("알려진 emotionTag에 대해 해당하는 메시지 반환", () => {
    const result = service.getFallbackComment(["편안함"]);
    expect(result).toContain("편안");
  });

  it("알려지지 않은 emotionTag에 대해 기본 메시지 반환", () => {
    const result = service.getFallbackComment(["알수없는감정"]);
    expect(result.length).toBeGreaterThan(0);
  });

  it("여러 emotionTags 중 첫 번째를 기반으로 메시지 반환", () => {
    const result = service.getFallbackComment(["설렘", "기쁨"]);
    expect(result).toContain("설렘");
  });

  it("다양한 emotionTags 조합에서 항상 비어있지 않은 문자열 반환", () => {
    const tagCombinations = [
      ["편안함"], ["설렘"], ["뿌듯함"], ["안정감"],
      ["해방감"], ["기쁨"], ["감사"], ["여유"],
      ["호기심"], ["따뜻함"], ["기록됨"],
      ["편안함", "기쁨", "설렘"],
      [],
    ];
    for (const tags of tagCombinations) {
      const result = service.getFallbackComment(tags);
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
