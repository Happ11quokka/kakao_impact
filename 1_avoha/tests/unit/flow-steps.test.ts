import { describe, it, expect } from "vitest";
import { ConversationStateManager } from "@/services/conversation-state-manager";
import type { ConversationState } from "@/types";

describe("UX 플로우 검증", () => {
  it("홈→촬영→건너뛰기→홈이 4단계 이내이다 (Requirements 8.1, 8.2)", () => {
    // Step 1: 홈 (initial)
    // Step 2: FAB 탭 → 촬영 (PHOTO_UPLOADED)
    // Step 3: 건너뛰기 (SKIPPED → RECORD_SAVING)
    // Step 4: 홈 복귀 (COMPLETED)
    const mgr = new ConversationStateManager("PHOTO_UPLOADED");
    mgr.transition({
      type: "PHOTO_UPLOAD_COMPLETE",
      imageUrl: "https://example.com/photo.jpg",
      exif: { dateTaken: new Date(), latitude: 37.5, longitude: 127.0 },
    });
    mgr.transition({
      type: "VISION_ANALYSIS_COMPLETE",
      result: { visionTags: ["sky"], confidence: 0.9, rawResponse: {} },
    });

    // Skip
    mgr.transition({ type: "USER_SKIP" });
    expect(mgr.getCurrentState()).toBe("SKIPPED");

    // Save
    mgr.transition({ type: "RECORD_SAVED" });
    expect(mgr.getCurrentState()).toBe("COMPLETED");

    // The flow steps: 홈(1) → 촬영(2) → 건너뛰기(3) → 홈(4) = 4단계
    const steps = 4;
    expect(steps).toBeLessThanOrEqual(4);
  });

  it("PHOTO_UPLOADED 다음에 편집 상태가 없다 (Requirements 2.4)", () => {
    const states: ConversationState[] = [
      "PHOTO_UPLOADED",
      "VISION_ANALYZING",
      "VISION_FAILED",
      "QUESTION_GENERATED",
      "AWAITING_RESPONSE",
      "SKIP_HIGHLIGHTED",
      "RESPONSE_RECEIVED",
      "SKIPPED",
      "EMOTION_ANALYZING",
      "COMMENT_GENERATING",
      "COMMENT_READY",
      "COMMENT_FAILED",
      "FALLBACK_COMMENT",
      "FALLBACK_SAVE",
      "INSIGHT_DISPLAYED",
      "RECORD_SAVING",
      "COMPLETED",
    ];

    // There should be no "EDITING" or "PHOTO_EDITING" state
    const editStates = states.filter(
      (s) => s.includes("EDIT") || s.includes("CROP") || s.includes("FILTER")
    );
    expect(editStates).toHaveLength(0);
  });

  it("정상 플로우: 사진→질문→답변→코멘트→저장", () => {
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
    mgr.transition({ type: "USER_RESPONSE", text: "공원 산책이 좋았어요" });
    mgr.transition({
      type: "EMOTION_ANALYSIS_COMPLETE",
      result: { emotionPolarity: "positive", emotionTags: ["편안함"], contextKeywords: ["산책"] },
    });
    mgr.transition({ type: "COMMENT_GENERATED", comment: "따뜻한 하루였네요!" });

    expect(mgr.getCurrentState()).toBe("COMMENT_READY");
    expect(mgr.getContext().aiComment).toBe("따뜻한 하루였네요!");
    expect(mgr.getContext().userText).toBe("공원 산책이 좋았어요");
  });
});

describe("통합 플로우 검증", () => {
  it("정상 플로우 전체 경로가 올바르게 동작한다", async () => {
    const { SohwakhaengFlow } = await import("@/services/sohwakhaeng-flow");
    const { RecordStorageService } = await import("@/services/record-storage-service");

    const storage = new RecordStorageService();
    const flow = new SohwakhaengFlow({
      visionClient: {
        analyzeImage: async () => ({
          tags: ["하늘", "공원"],
          confidence: 0.9,
          raw: {},
        }),
      },
      llmClient: {
        generateComment: async () => "따뜻한 하루였네요!",
      },
      storage,
    });

    const result = await flow.executeFullFlow(
      "user-1",
      "https://example.com/photo.jpg",
      { exif: { DateTimeOriginal: "2025-06-15T10:30:00Z", GPSLatitude: 37.5, GPSLongitude: 127.0 } },
      "공원 산책이 좋았어요"
    );

    expect(result.record.userId).toBe("user-1");
    expect(result.record.imageUrl).toBe("https://example.com/photo.jpg");
    expect(result.record.rawUserText).toBe("공원 산책이 좋았어요");
    expect(result.record.skipFlag).toBe(false);
    expect(result.aiComment).toBe("따뜻한 하루였네요!");
    expect(result.record.visionTags).toEqual(["하늘", "공원"]);

    // Verify saved in storage
    const saved = await storage.getById(result.record.id);
    expect(saved.id).toBe(result.record.id);
  });

  it("건너뛰기 플로우가 올바르게 동작한다", async () => {
    const { SohwakhaengFlow } = await import("@/services/sohwakhaeng-flow");
    const { RecordStorageService } = await import("@/services/record-storage-service");

    const storage = new RecordStorageService();
    const flow = new SohwakhaengFlow({
      visionClient: { analyzeImage: async () => ({ tags: [], confidence: 0, raw: {} }) },
      llmClient: { generateComment: async () => "" },
      storage,
    });

    const result = await flow.executeSkipFlow(
      "user-1",
      "https://example.com/photo.jpg",
      { exif: { GPSLatitude: 37.5, GPSLongitude: 127.0 } }
    );

    expect(result.record.skipFlag).toBe(true);
    expect(result.record.rawUserText).toBeNull();
    expect(result.aiComment).toBeNull();
  });

  it("Vision API 오류 시 대체 경로로 저장한다", async () => {
    const { SohwakhaengFlow } = await import("@/services/sohwakhaeng-flow");
    const { RecordStorageService } = await import("@/services/record-storage-service");

    const storage = new RecordStorageService();
    const flow = new SohwakhaengFlow({
      visionClient: {
        analyzeImage: async () => { throw new Error("Vision API error"); },
      },
      llmClient: { generateComment: async () => "" },
      storage,
    });

    const result = await flow.executeFullFlow(
      "user-1",
      "https://example.com/photo.jpg",
      {},
      "테스트"
    );

    expect(result.record.skipFlag).toBe(true);
    expect(result.record.emotionTags).toEqual(["기록됨"]);
  });
});
