import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ConversationStateManager } from "@/services/conversation-state-manager";
import type { ExifMetadata } from "@/types";

describe("Feature: sohwakhaeng-service, Property 5: 건너뛰기 경로 데이터 무결성", () => {
  it("건너뛰기 시 skip_flag=true, userText=null, imageUrl/위치 정보 보존", () => {
    const exifArb = fc.record({
      dateTaken: fc.option(fc.date(), { nil: null }),
      latitude: fc.option(fc.double({ min: 33, max: 39, noNaN: true }), { nil: null }),
      longitude: fc.option(fc.double({ min: 124, max: 132, noNaN: true }), { nil: null }),
    });

    fc.assert(
      fc.property(fc.webUrl(), exifArb, (imageUrl, exif: ExifMetadata) => {
        const mgr = new ConversationStateManager("PHOTO_UPLOADED");

        mgr.transition({
          type: "PHOTO_UPLOAD_COMPLETE",
          imageUrl,
          exif,
        });
        mgr.transition({
          type: "VISION_ANALYSIS_COMPLETE",
          result: { visionTags: ["test"], confidence: 0.8, rawResponse: {} },
        });
        mgr.transition({ type: "USER_SKIP" });

        const ctx = mgr.getContext();
        expect(ctx.skipFlag).toBe(true);
        expect(ctx.userText).toBeNull();
        expect(ctx.imageUrl).toBe(imageUrl);
        expect(ctx.exifMetadata).toEqual(exif);
      }),
      { numRuns: 100 }
    );
  });
});
