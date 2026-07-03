import type {
  SohwakhaengRecord,
  ExifMetadata,
  VisionResult,
  EmotionResult,
} from "@/types";
import { ConversationStateManager } from "./conversation-state-manager";
import type { VisionApiClient } from "./vision-analysis-service";
import { VisionAnalysisService } from "./vision-analysis-service";
import { EmotionExtractionService } from "./emotion-extraction-service";
import type { LlmClient } from "./comment-generation-service";
import { CommentGenerationService } from "./comment-generation-service";
import { RecordStorageService } from "./record-storage-service";
import { extractExif, type PhotoFile } from "./exif-extractor";

export interface FlowDependencies {
  visionClient: VisionApiClient;
  llmClient: LlmClient;
  storage: RecordStorageService;
}

export interface FlowResult {
  record: SohwakhaengRecord;
  aiComment: string | null;
}

export class SohwakhaengFlow {
  private visionService: VisionAnalysisService;
  private emotionService: EmotionExtractionService;
  private commentService: CommentGenerationService;
  private storage: RecordStorageService;

  constructor(deps: FlowDependencies) {
    this.visionService = new VisionAnalysisService(deps.visionClient);
    this.emotionService = new EmotionExtractionService();
    this.commentService = new CommentGenerationService(deps.llmClient);
    this.storage = deps.storage;
  }

  /** 정상 플로우: 사진 → 질문 → 답변 → 코멘트 → 저장 */
  async executeFullFlow(
    userId: string,
    imageUrl: string,
    photo: PhotoFile,
    userText: string
  ): Promise<FlowResult> {
    const fsm = new ConversationStateManager();
    const exif = extractExif(photo);

    fsm.transition({ type: "PHOTO_UPLOAD_COMPLETE", imageUrl, exif });

    // Vision analysis
    let visionResult: VisionResult;
    try {
      visionResult = await this.visionService.analyze(imageUrl);
      fsm.transition({ type: "VISION_ANALYSIS_COMPLETE", result: visionResult });
    } catch (e) {
      fsm.transition({
        type: "VISION_ANALYSIS_FAILED",
        error: e instanceof Error ? e : new Error(String(e)),
      });
      return this.saveFallbackRecord(userId, imageUrl, exif, fsm);
    }

    // User response
    fsm.transition({ type: "USER_RESPONSE", text: userText });

    // Emotion analysis
    let emotionResult: EmotionResult;
    try {
      emotionResult = await this.emotionService.extractWithText(visionResult, userText);
      fsm.transition({ type: "EMOTION_ANALYSIS_COMPLETE", result: emotionResult });
    } catch {
      emotionResult = {
        emotionPolarity: "neutral",
        emotionTags: ["기록됨"],
        contextKeywords: ["일상"],
      };
      fsm.transition({ type: "EMOTION_ANALYSIS_COMPLETE", result: emotionResult });
    }

    // Comment generation
    let aiComment: string;
    try {
      aiComment = await this.commentService.generate({
        visionTags: visionResult.visionTags,
        emotionTags: emotionResult.emotionTags,
        contextKeywords: emotionResult.contextKeywords,
        userText,
        location: exif.latitude != null && exif.longitude != null
          ? { latitude: exif.latitude, longitude: exif.longitude }
          : null,
        createdAt: new Date(),
        userPreferences: null,
      });
      fsm.transition({ type: "COMMENT_GENERATED", comment: aiComment });
    } catch {
      aiComment = this.commentService.getFallbackComment(emotionResult.emotionTags);
    }

    const record = this.buildRecord(userId, imageUrl, exif, userText, visionResult, emotionResult, aiComment, false);
    await this.storage.save(record);

    return { record, aiComment };
  }

  /** 건너뛰기 플로우: 사진 → 건너뛰기 → 저장 */
  async executeSkipFlow(
    userId: string,
    imageUrl: string,
    photo: PhotoFile
  ): Promise<FlowResult> {
    const exif = extractExif(photo);

    const record: SohwakhaengRecord = {
      id: crypto.randomUUID(),
      userId,
      imageUrl,
      createdAt: exif.dateTaken ?? new Date(),
      latitude: exif.latitude,
      longitude: exif.longitude,
      rawUserText: null,
      visionTags: [],
      emotionTags: ["기록됨"],
      contextKeywords: [],
      aiComment: null,
      skipFlag: true,
      emotionPolarity: null,
    };

    await this.storage.save(record);
    return { record, aiComment: null };
  }

  /** 오류 대체 플로우 */
  private async saveFallbackRecord(
    userId: string,
    imageUrl: string,
    exif: ExifMetadata,
    _fsm: ConversationStateManager
  ): Promise<FlowResult> {
    const record: SohwakhaengRecord = {
      id: crypto.randomUUID(),
      userId,
      imageUrl,
      createdAt: exif.dateTaken ?? new Date(),
      latitude: exif.latitude,
      longitude: exif.longitude,
      rawUserText: null,
      visionTags: [],
      emotionTags: ["기록됨"],
      contextKeywords: [],
      aiComment: null,
      skipFlag: true,
      emotionPolarity: null,
    };

    await this.storage.save(record);
    return { record, aiComment: null };
  }

  private buildRecord(
    userId: string,
    imageUrl: string,
    exif: ExifMetadata,
    userText: string | null,
    visionResult: VisionResult,
    emotionResult: EmotionResult,
    aiComment: string,
    skipFlag: boolean
  ): SohwakhaengRecord {
    return {
      id: crypto.randomUUID(),
      userId,
      imageUrl,
      createdAt: exif.dateTaken ?? new Date(),
      latitude: exif.latitude,
      longitude: exif.longitude,
      rawUserText: userText,
      visionTags: visionResult.visionTags,
      emotionTags: emotionResult.emotionTags,
      contextKeywords: emotionResult.contextKeywords,
      aiComment,
      skipFlag,
      emotionPolarity: emotionResult.emotionPolarity,
    };
  }
}
