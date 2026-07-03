import { describe, it, expect } from "vitest";
import { extractExif } from "@/services/exif-extractor";

describe("EXIF 추출 엣지 케이스", () => {
  it("EXIF 없는 사진은 모든 필드 null", () => {
    expect(extractExif({})).toEqual({
      dateTaken: null,
      latitude: null,
      longitude: null,
    });
  });

  it("GPS만 있고 날짜 없는 경우", () => {
    const result = extractExif({
      exif: { GPSLatitude: 37.5, GPSLongitude: 127.0 },
    });
    expect(result.dateTaken).toBeNull();
    expect(result.latitude).toBe(37.5);
    expect(result.longitude).toBe(127.0);
  });

  it("날짜만 있고 GPS 없는 경우", () => {
    const result = extractExif({
      exif: { DateTimeOriginal: "2025-06-15T10:30:00Z" },
    });
    expect(result.dateTaken).toBeInstanceOf(Date);
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it("유효하지 않은 날짜 문자열은 null 반환", () => {
    const result = extractExif({
      exif: { DateTimeOriginal: "not-a-date" },
    });
    expect(result.dateTaken).toBeNull();
  });

  it("모든 EXIF 필드가 존재하는 경우", () => {
    const result = extractExif({
      exif: {
        DateTimeOriginal: "2025-06-15T10:30:00Z",
        GPSLatitude: 37.5665,
        GPSLongitude: 126.978,
      },
    });
    expect(result.dateTaken).toBeInstanceOf(Date);
    expect(result.latitude).toBe(37.5665);
    expect(result.longitude).toBe(126.978);
  });
});
