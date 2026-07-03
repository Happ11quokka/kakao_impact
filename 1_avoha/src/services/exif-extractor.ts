import type { ExifMetadata } from "@/types";

export interface PhotoFile {
  exif?: {
    DateTimeOriginal?: string;
    GPSLatitude?: number;
    GPSLongitude?: number;
  };
}

export function extractExif(photo: PhotoFile): ExifMetadata {
  if (!photo.exif) {
    return { dateTaken: null, latitude: null, longitude: null };
  }

  const { DateTimeOriginal, GPSLatitude, GPSLongitude } = photo.exif;

  let dateTaken: Date | null = null;
  if (DateTimeOriginal) {
    const parsed = new Date(DateTimeOriginal);
    dateTaken = isNaN(parsed.getTime()) ? null : parsed;
  }

  return {
    dateTaken,
    latitude: GPSLatitude ?? null,
    longitude: GPSLongitude ?? null,
  };
}
