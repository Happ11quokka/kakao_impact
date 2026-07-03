/** 소확행 기록 */
export interface SohwakhaengRecord {
  id: string;
  userId: string;
  imageUrl: string;
  createdAt: Date;
  latitude: number | null;
  longitude: number | null;
  rawUserText: string | null;
  visionTags: string[];
  emotionTags: string[];
  contextKeywords: string[];
  aiComment: string | null;
  skipFlag: boolean;
  emotionPolarity: "positive" | "neutral" | "negative" | null;
}

/** EXIF 메타데이터 */
export interface ExifMetadata {
  dateTaken: Date | null;
  latitude: number | null;
  longitude: number | null;
}

/** 지도 핀 뷰모델 */
export interface RecordPin {
  id: string;
  latitude: number;
  longitude: number;
  thumbnailUrl: string;
  emotionKeyword: string;
  shortText: string;
}

/** 최근 카드 뷰모델 */
export interface RecentCard {
  id: string;
  imageUrl: string;
  emotionKeyword: string;
  shortText: string;
  createdAt: Date;
}

/** 지도 범위 */
export interface MapBounds {
  northEast: { latitude: number; longitude: number };
  southWest: { latitude: number; longitude: number };
}
