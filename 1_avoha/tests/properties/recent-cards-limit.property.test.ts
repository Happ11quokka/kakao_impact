import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { RecordStorageService } from "@/services/record-storage-service";
import { sohwakhaengRecordArb } from "../generators/record.generator";

describe("Feature: sohwakhaeng-service, Property 2: 최근 기록 카드 개수 제한", () => {
  it("getRecentByUser(limit=4)는 min(전체 기록 수, 4) 이하를 반환한다", () => {
    fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(sohwakhaengRecordArb, { minLength: 0, maxLength: 20 }),
        async (userId, records) => {
          const storage = new RecordStorageService();
          const userRecords = records.map((r, i) => ({
            ...r,
            id: `${r.id}-${i}`,
            userId,
          }));

          for (const record of userRecords) {
            await storage.save(record);
          }

          const recent = await storage.getRecentByUser(userId, 4);
          expect(recent.length).toBeLessThanOrEqual(Math.min(userRecords.length, 4));
        }
      ),
      { numRuns: 100 }
    );
  });
});
