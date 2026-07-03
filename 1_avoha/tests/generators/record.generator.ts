import fc from "fast-check";
import type { SohwakhaengRecord, RecordPin, RecentCard } from "@/types";

export const emotionPolarityArb = fc.constantFrom(
  "positive" as const,
  "neutral" as const,
  "negative" as const
);

export const koreanTagArb = fc.constantFrom(
  "편안함", "설렘", "뿌듯함", "안정감", "해방감",
  "기쁨", "감사", "여유", "호기심", "따뜻함"
);

export const contextKeywordArb = fc.constantFrom(
  "산책", "날씨", "휴식", "친구", "커피",
  "음악", "독서", "요리", "운동", "여행"
);

export const sohwakhaengRecordArb: fc.Arbitrary<SohwakhaengRecord> = fc.record({
  id: fc.uuid(),
  userId: fc.uuid(),
  imageUrl: fc.webUrl(),
  createdAt: fc.date({ min: new Date("2024-01-01"), max: new Date("2026-12-31") }),
  latitude: fc.option(fc.double({ min: 33, max: 39, noNaN: true }), { nil: null }),
  longitude: fc.option(fc.double({ min: 124, max: 132, noNaN: true }), { nil: null }),
  rawUserText: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
  visionTags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
  emotionTags: fc.array(koreanTagArb, { minLength: 1, maxLength: 5 }),
  contextKeywords: fc.array(contextKeywordArb, { minLength: 1, maxLength: 5 }),
  aiComment: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: null }),
  skipFlag: fc.boolean(),
  emotionPolarity: fc.option(emotionPolarityArb, { nil: null }),
});

export const recordPinArb: fc.Arbitrary<RecordPin> = fc.record({
  id: fc.uuid(),
  latitude: fc.double({ min: 33, max: 39, noNaN: true }),
  longitude: fc.double({ min: 124, max: 132, noNaN: true }),
  thumbnailUrl: fc.webUrl(),
  emotionKeyword: koreanTagArb,
  shortText: fc.string({ minLength: 1, maxLength: 50 }),
});

export const recentCardArb: fc.Arbitrary<RecentCard> = fc.record({
  id: fc.uuid(),
  imageUrl: fc.webUrl(),
  emotionKeyword: koreanTagArb,
  shortText: fc.string({ minLength: 1, maxLength: 50 }),
  createdAt: fc.date({ min: new Date("2024-01-01"), max: new Date("2026-12-31") }),
});
