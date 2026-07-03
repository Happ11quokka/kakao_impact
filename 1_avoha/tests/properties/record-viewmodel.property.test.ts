import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { toRecordPin, toRecentCard } from "@/services/record-viewmodel";
import { sohwakhaengRecordArb } from "../generators/record.generator";

describe("Feature: sohwakhaeng-service, Property 1: 기록→뷰모델 변환 시 필수 필드 포함", () => {
  it("RecordPin 변환 시 thumbnailUrl, emotionKeyword, shortText가 비어있지 않다", () => {
    fc.assert(
      fc.property(sohwakhaengRecordArb, (record) => {
        const pin = toRecordPin(record);
        expect(pin.thumbnailUrl.length).toBeGreaterThan(0);
        expect(pin.emotionKeyword.length).toBeGreaterThan(0);
        expect(pin.shortText.length).toBeGreaterThan(0);
        expect(pin.id).toBe(record.id);
      }),
      { numRuns: 100 }
    );
  });

  it("RecentCard 변환 시 imageUrl, emotionKeyword, shortText가 비어있지 않다", () => {
    fc.assert(
      fc.property(sohwakhaengRecordArb, (record) => {
        const card = toRecentCard(record);
        expect(card.imageUrl.length).toBeGreaterThan(0);
        expect(card.emotionKeyword.length).toBeGreaterThan(0);
        expect(card.shortText.length).toBeGreaterThan(0);
        expect(card.id).toBe(record.id);
      }),
      { numRuns: 100 }
    );
  });
});
