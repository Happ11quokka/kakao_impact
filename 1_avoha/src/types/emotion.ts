/** Vision API 결과 */
export interface VisionResult {
  visionTags: string[];
  confidence: number;
  rawResponse: Record<string, unknown>;
}

/** 감정 추출 결과 */
export interface EmotionResult {
  emotionPolarity: "positive" | "neutral" | "negative";
  emotionTags: string[];
  contextKeywords: string[];
}

/** 감정 분석 데이터 (직렬화 대상) */
export interface EmotionAnalysisData {
  emotionTags: string[];
  emotionPolarity: "positive" | "neutral" | "negative";
  contextKeywords: string[];
  visionTags: string[];
}

/** AI 코멘트 생성 입력 */
export interface CommentInput {
  visionTags: string[];
  emotionTags: string[];
  contextKeywords: string[];
  userText: string | null;
  location: { latitude: number; longitude: number } | null;
  createdAt: Date;
  userPreferences: PreferenceVector | null;
}

/** 사용자 취향 벡터 */
export interface PreferenceVector {
  vector: number[];
  topEmotionTags: string[];
  topContextKeywords: string[];
  preferredTimeSlots: string[];
  preferredPlaceTypes: string[];
  emotionFrequency: Record<string, number>;
  totalRecords: number;
}
