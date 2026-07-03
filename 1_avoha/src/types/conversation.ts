import type { ExifMetadata } from "./record";
import type { VisionResult, EmotionResult } from "./emotion";

/** FSM 대화 상태 */
export type ConversationState =
  | "PHOTO_UPLOADED"
  | "VISION_ANALYZING"
  | "VISION_FAILED"
  | "QUESTION_GENERATED"
  | "AWAITING_RESPONSE"
  | "SKIP_HIGHLIGHTED"
  | "RESPONSE_RECEIVED"
  | "SKIPPED"
  | "EMOTION_ANALYZING"
  | "COMMENT_GENERATING"
  | "COMMENT_READY"
  | "COMMENT_FAILED"
  | "FALLBACK_COMMENT"
  | "FALLBACK_SAVE"
  | "INSIGHT_DISPLAYED"
  | "RECORD_SAVING"
  | "COMPLETED";

/** FSM 이벤트 */
export type ConversationEvent =
  | { type: "PHOTO_UPLOAD_COMPLETE"; imageUrl: string; exif: ExifMetadata }
  | { type: "VISION_ANALYSIS_COMPLETE"; result: VisionResult }
  | { type: "VISION_ANALYSIS_FAILED"; error: Error }
  | { type: "USER_RESPONSE"; text: string }
  | { type: "USER_SKIP" }
  | { type: "TIMEOUT_10S" }
  | { type: "EMOTION_ANALYSIS_COMPLETE"; result: EmotionResult }
  | { type: "COMMENT_GENERATED"; comment: string }
  | { type: "COMMENT_GENERATION_FAILED"; error: Error }
  | { type: "INSIGHT_CLOSED" }
  | { type: "RECORD_SAVED" };

/** FSM 컨텍스트 */
export interface ConversationContext {
  imageUrl: string | null;
  exifMetadata: ExifMetadata | null;
  visionResult: VisionResult | null;
  userText: string | null;
  emotionResult: EmotionResult | null;
  aiComment: string | null;
  skipFlag: boolean;
  question: string | null;
}
