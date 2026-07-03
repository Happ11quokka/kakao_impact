import type { SohwakhaengRecord, RecordPin, RecentCard } from "@/types";

export function toRecordPin(record: SohwakhaengRecord): RecordPin {
  return {
    id: record.id,
    latitude: record.latitude ?? 0,
    longitude: record.longitude ?? 0,
    thumbnailUrl: record.imageUrl,
    emotionKeyword: record.emotionTags[0] ?? "기록됨",
    shortText:
      record.rawUserText?.slice(0, 50) ??
      record.aiComment?.slice(0, 50) ??
      "소확행 기록",
  };
}

export function toRecentCard(record: SohwakhaengRecord): RecentCard {
  return {
    id: record.id,
    imageUrl: record.imageUrl,
    emotionKeyword: record.emotionTags[0] ?? "기록됨",
    shortText:
      record.rawUserText?.slice(0, 50) ??
      record.aiComment?.slice(0, 50) ??
      "소확행 기록",
    createdAt: record.createdAt,
  };
}
