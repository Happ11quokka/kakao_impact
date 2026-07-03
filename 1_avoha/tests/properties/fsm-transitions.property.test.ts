import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ConversationStateManager } from "@/services/conversation-state-manager";
import type { ConversationState, ConversationEvent } from "@/types";

describe("Feature: sohwakhaeng-service, Property 4: FSM 유효 상태 전이", () => {
  const definedTransitions: Array<{ from: ConversationState; event: ConversationEvent; to: ConversationState }> = [
    { from: "PHOTO_UPLOADED", event: { type: "VISION_ANALYSIS_COMPLETE", result: { visionTags: ["sky"], confidence: 0.9, rawResponse: {} } }, to: "QUESTION_GENERATED" },
    { from: "PHOTO_UPLOADED", event: { type: "VISION_ANALYSIS_FAILED", error: new Error("fail") }, to: "VISION_FAILED" },
    { from: "AWAITING_RESPONSE", event: { type: "USER_RESPONSE", text: "hello" }, to: "RESPONSE_RECEIVED" },
    { from: "AWAITING_RESPONSE", event: { type: "USER_SKIP" }, to: "SKIPPED" },
    { from: "AWAITING_RESPONSE", event: { type: "TIMEOUT_10S" }, to: "SKIP_HIGHLIGHTED" },
    { from: "SKIP_HIGHLIGHTED", event: { type: "USER_RESPONSE", text: "hello" }, to: "RESPONSE_RECEIVED" },
    { from: "SKIP_HIGHLIGHTED", event: { type: "USER_SKIP" }, to: "SKIPPED" },
    { from: "QUESTION_GENERATED", event: { type: "USER_RESPONSE", text: "hello" }, to: "RESPONSE_RECEIVED" },
    { from: "QUESTION_GENERATED", event: { type: "USER_SKIP" }, to: "SKIPPED" },
    { from: "COMMENT_GENERATING", event: { type: "COMMENT_GENERATED", comment: "nice" }, to: "COMMENT_READY" },
    { from: "COMMENT_GENERATING", event: { type: "COMMENT_GENERATION_FAILED", error: new Error("fail") }, to: "COMMENT_FAILED" },
    { from: "INSIGHT_DISPLAYED", event: { type: "INSIGHT_CLOSED" }, to: "RECORD_SAVING" },
    { from: "RECORD_SAVING", event: { type: "RECORD_SAVED" }, to: "COMPLETED" },
  ];

  it("정의된 전이 규칙에 따라 올바른 다음 상태를 반환한다", () => {
    const transArb = fc.constantFrom(...definedTransitions);

    fc.assert(
      fc.property(transArb, ({ from, event, to }) => {
        const mgr = new ConversationStateManager(from);
        const next = mgr.transition(event);
        expect(next).toBe(to);
      }),
      { numRuns: 100 }
    );
  });

  it("유효하지 않은 이벤트에 대해 현재 상태를 유지한다", () => {
    const mgr = new ConversationStateManager("COMPLETED");
    const result = mgr.transition({ type: "USER_SKIP" });
    expect(result).toBe("COMPLETED");
  });
});
