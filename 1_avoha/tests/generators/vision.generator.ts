import fc from "fast-check";
import type { PhotoFile } from "@/services/exif-extractor";

export const photoWithExifArb: fc.Arbitrary<PhotoFile> = fc.record({
  exif: fc.option(
    fc.record({
      DateTimeOriginal: fc.option(
        fc.date({ min: new Date("2020-01-01T00:00:00Z"), max: new Date("2026-12-31T23:59:59Z") })
          .filter((d) => !isNaN(d.getTime()))
          .map((d) => d.toISOString()),
        { nil: undefined }
      ),
      GPSLatitude: fc.option(
        fc.double({ min: 33, max: 39, noNaN: true }),
        { nil: undefined }
      ),
      GPSLongitude: fc.option(
        fc.double({ min: 124, max: 132, noNaN: true }),
        { nil: undefined }
      ),
    }),
    { nil: undefined }
  ),
});

export const photoWithoutExifArb: fc.Arbitrary<PhotoFile> = fc.constant({});

export const photoArb: fc.Arbitrary<PhotoFile> = fc.oneof(
  photoWithExifArb,
  photoWithoutExifArb
);
