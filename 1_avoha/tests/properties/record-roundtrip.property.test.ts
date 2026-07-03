import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { RecordStorageService } from "@/services/record-storage-service";
import { sohwakhaengRecordArb } from "../generators/record.generator";

describe("Feature: sohwakhaeng-service, Property 9: 기록 저장-조회 라운드트립", () => {
  it("save 후 getById로 조회하면 원본과 동일한 데이터를 반환한다", () => {
    fc.assert(
      fc.asyncProperty(sohwakhaengRecordArb, async (record) => {
        const storage = new RecordStorageService();
        await storage.save(record);
        const retrieved = await storage.getById(record.id);

        expect(retrieved.id).toBe(record.id);
        expect(retrieved.userId).toBe(record.userId);
        expect(retrieved.imageUrl).toBe(record.imageUrl);
        expect(retrieved.latitude).toBe(record.latitude);
        expect(retrieved.longitude).toBe(record.longitude);
        expect(retrieved.rawUserText).toBe(record.rawUserText);
        expect(retrieved.visionTags).toEqual(record.visionTags);
        expect(retrieved.emotionTags).toEqual(record.emotionTags);
        expect(retrieved.contextKeywords).toEqual(record.contextKeywords);
        expect(retrieved.aiComment).toBe(record.aiComment);
        expect(retrieved.skipFlag).toBe(record.skipFlag);
      }),
      { numRuns: 100 }
    );
  });

  it("저장 후 getRecordPins에 해당 기록 핀이 포함된다", () => {
    fc.assert(
      fc.asyncProperty(
        sohwakhaengRecordArb.filter((r) => r.latitude !== null && r.longitude !== null),
        async (record) => {
          const storage = new RecordStorageService();
          await storage.save(record);

          const pins = await storage.getRecordPins(record.userId, {
            southWest: { latitude: record.latitude! - 1, longitude: record.longitude! - 1 },
            northEast: { latitude: record.latitude! + 1, longitude: record.longitude! + 1 },
          });

          expect(pins.some((p) => p.id === record.id)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
