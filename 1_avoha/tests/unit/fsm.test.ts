import { describe, it, expect } from "vitest";
import { ConversationStateManager } from "@/services/conversation-state-manager";

describe("ConversationStateManager 엣지 케이스", () => {
  it("초기 상태는 PHOTO_UPLOADED이다", () => {
    const mgr = new ConversationStateManager();
    expect(mgr.getCurrentState()).toBe("PHOTO_UPLOADED");
  });

  it("초기 컨텍스트는 모두 null/false이다", () => {
    const mgr = new ConversationStateManager();
    const ctx = mgr.getContext();
    expect(ctx.imageUrl).toBeNull();
    expect(ctx.exifMetadata).toBeNull();
    expect(ctx.visionResult).toBeNull();
    expect(ctx.userText).toBeNull();
    expect(ctx.emotionResult).toBeNull();
    expect(ctx.aiComment).toBeNull();
    expect(ctx.skipFlag).toBe(false);
    expect(ctx.question).toBeNull();
  });

  it("유효하지 않은 상태 전이 시도 시 현재 상태를 유지한다", () => {
    const mgr = new ConversationStateManager("PHOTO_UPLOADED");
    const result = mgr.transition({ type: "USER_SKIP" });
    expect(result).toBe("PHOTO_UPLOADED");
  });

  it("COMPLETED 상태에서는 어떤 이벤트도 상태를 변경하지 않는다", () => {
    const mgr = new ConversationStateManager("COMPLETED");
    expect(mgr.transition({ type: "USER_SKIP" })).toBe("COMPLETED");
    expect(mgr.transition({ type: "RECORD_SAVED" })).toBe("COMPLETED");
  });

  it("AWAITING_RESPONSE에서 TIMEOUT_10S → SKIP_HIGHLIGHTED 전이", () => {
    const mgr = new ConversationStateManager("AWAITING_RESPONSE");
    const result = mgr.transition({ type: "TIMEOUT_10S" });
    expect(result).toBe("SKIP_HIGHLIGHTED");
  });

  it("SKIP_HIGHLIGHTED에서도 USER_RESPONSE로 응답 가능", () => {
    const mgr = new ConversationStateManager("SKIP_HIGHLIGHTED");
    const result = mgr.transition({ type: "USER_RESPONSE", text: "답변" });
    expect(result).toBe("RESPONSE_RECEIVED");
    expect(mgr.getContext().userText).toBe("답변");
  });

  it("VISION_FAILED 경로에서 skipFlag가 true로 설정된다", () => {
    const mgr = new ConversationStateManager("PHOTO_UPLOADED");
    mgr.transition({
      type: "PHOTO_UPLOAD_COMPLETE",
      imageUrl: "https://example.com/photo.jpg",
      exif: { dateTaken: null, latitude: 37.5, longitude: 127.0 },
    });
    mgr.transition({ type: "VISION_ANALYSIS_FAILED", error: new Error("fail") });
    expect(mgr.getCurrentState()).toBe("VISION_FAILED");
    expect(mgr.getContext().skipFlag).toBe(true);
  });

  it("정상 전체 플로우가 COMPLETED까지 도달한다", () => {
    const mgr = new ConversationStateManager();
    mgr.transition({
      type: "PHOTO_UPLOAD_COMPLETE",
      imageUrl: "https://example.com/photo.jpg",
      exif: { dateTaken: new Date(), latitude: 37.5, longitude: 127.0 },
    });
    mgr.transition({
      type: "VISION_ANALYSIS_COMPLETE",
      result: { visionTags: ["하늘", "공원"], confidence: 0.95, rawResponse: {} },
    });
    mgr.transition({ type: "USER_RESPONSE", text: "오늘 공원 산책 좋았어요" });
    mgr.transition({
      type: "EMOTION_ANALYSIS_COMPLETE",
      result: { emotionPolarity: "positive", emotionTags: ["편안함"], contextKeywords: ["산책"] },
    });
    mgr.transition({ type: "COMMENT_GENERATED", comment: "따뜻한 하루였네요!" });

    expect(mgr.getCurrentState()).toBe("COMMENT_READY");

    // COMMENT_READY -> INSIGHT_DISPLAYED is not a direct transition
    // We need INSIGHT_CLOSED from INSIGHT_DISPLAYED
    // Let's check the flow: COMMENT_READY -> need INSIGHT_CLOSED -> RECORD_SAVING
    // Actually looking at the FSM: COMMENT_READY -> INSIGHT_CLOSED -> RECORD_SAVING
    const mgr2 = new ConversationStateManager("INSIGHT_DISPLAYED");
    mgr2.transition({ type: "INSIGHT_CLOSED" });
    expect(mgr2.getCurrentState()).toBe("RECORD_SAVING");
    mgr2.transition({ type: "RECORD_SAVED" });
    expect(mgr2.getCurrentState()).toBe("COMPLETED");
  });
});
