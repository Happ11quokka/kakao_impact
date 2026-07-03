import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { extractExif } from "@/services/exif-extractor";
import { photoWithExifArb, photoWithoutExifArb } from "../generators/vision.generator";

describe("Feature: sohwakhaeng-service, Property 3: EXIF 메타데이터 추출", () => {
  it("EXIF가 있는 사진은 dateTaken/latitude/longitude를 ExifMetadata로 반환한다", () => {
    fc.assert(
      fc.property(photoWithExifArb, (photo) => {
        const result = extractExif(photo);
        expect(result).toHaveProperty("dateTaken");
        expect(result).toHaveProperty("latitude");
        expect(result).toHaveProperty("longitude");

        if (photo.exif?.GPSLatitude !== undefined) {
          expect(result.latitude).toBe(photo.exif.GPSLatitude);
        }
        if (photo.exif?.GPSLongitude !== undefined) {
          expect(result.longitude).toBe(photo.exif.GPSLongitude);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("EXIF가 없는 사진은 모든 필드가 null인 객체를 반환한다", () => {
    fc.assert(
      fc.property(photoWithoutExifArb, (photo) => {
        const result = extractExif(photo);
        expect(result.dateTaken).toBeNull();
        expect(result.latitude).toBeNull();
        expect(result.longitude).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
