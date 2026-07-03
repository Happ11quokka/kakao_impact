import type {
  ConversationState,
  ConversationEvent,
  ConversationContext,
} from "@/types";

const VALID_TRANSITIONS: Record<ConversationState, Partial<Record<ConversationEvent["type"], ConversationState>>> = {
  PHOTO_UPLOADED: {
    PHOTO_UPLOAD_COMPLETE: "PHOTO_UPLOADED",
    VISION_ANALYSIS_COMPLETE: "QUESTION_GENERATED",
    VISION_ANALYSIS_FAILED: "VISION_FAILED",
  },
  VISION_ANALYZING: {
    VISION_ANALYSIS_COMPLETE: "QUESTION_GENERATED",
    VISION_ANALYSIS_FAILED: "VISION_FAILED",
  },
  VISION_FAILED: {
    RECORD_SAVED: "COMPLETED",
  },
  QUESTION_GENERATED: {
    USER_RESPONSE: "RESPONSE_RECEIVED",
    USER_SKIP: "SKIPPED",
    TIMEOUT_10S: "SKIP_HIGHLIGHTED",
  },
  AWAITING_RESPONSE: {
    USER_RESPONSE: "RESPONSE_RECEIVED",
    USER_SKIP: "SKIPPED",
    TIMEOUT_10S: "SKIP_HIGHLIGHTED",
  },
  SKIP_HIGHLIGHTED: {
    USER_RESPONSE: "RESPONSE_RECEIVED",
    USER_SKIP: "SKIPPED",
  },
  RESPONSE_RECEIVED: {
    EMOTION_ANALYSIS_COMPLETE: "COMMENT_GENERATING",
  },
  SKIPPED: {
    RECORD_SAVED: "COMPLETED",
  },
  EMOTION_ANALYZING: {
    EMOTION_ANALYSIS_COMPLETE: "COMMENT_GENERATING",
    COMMENT_GENERATION_FAILED: "COMMENT_FAILED",
  },
  COMMENT_GENERATING: {
    COMMENT_GENERATED: "COMMENT_READY",
    COMMENT_GENERATION_FAILED: "COMMENT_FAILED",
  },
  COMMENT_READY: {
    INSIGHT_CLOSED: "RECORD_SAVING",
  },
  COMMENT_FAILED: {
    RECORD_SAVED: "COMPLETED",
  },
  FALLBACK_COMMENT: {
    INSIGHT_CLOSED: "RECORD_SAVING",
    RECORD_SAVED: "COMPLETED",
  },
  FALLBACK_SAVE: {
    RECORD_SAVED: "COMPLETED",
  },
  INSIGHT_DISPLAYED: {
    INSIGHT_CLOSED: "RECORD_SAVING",
  },
  RECORD_SAVING: {
    RECORD_SAVED: "COMPLETED",
  },
  COMPLETED: {},
};

function createInitialContext(): ConversationContext {
  return {
    imageUrl: null,
    exifMetadata: null,
    visionResult: null,
    userText: null,
    emotionResult: null,
    aiComment: null,
    skipFlag: false,
    question: null,
  };
}

export class ConversationStateManager {
  private state: ConversationState;
  private context: ConversationContext;

  constructor(
    initialState: ConversationState = "PHOTO_UPLOADED",
    initialContext?: Partial<ConversationContext>
  ) {
    this.state = initialState;
    this.context = { ...createInitialContext(), ...initialContext };
  }

  getCurrentState(): ConversationState {
    return this.state;
  }

  getContext(): ConversationContext {
    return { ...this.context };
  }

  transition(event: ConversationEvent): ConversationState {
    const transitions = VALID_TRANSITIONS[this.state];
    const nextState = transitions[event.type];

    if (!nextState) {
      return this.state;
    }

    // Update context based on event
    this.updateContext(event);
    this.state = nextState;

    // Handle special state transitions
    if (nextState === "SKIPPED") {
      this.context.skipFlag = true;
      this.context.userText = null;
    }

    if (nextState === "VISION_FAILED") {
      // Preserve existing context data on failure
      this.context.skipFlag = true;
    }

    if (nextState === "COMMENT_FAILED") {
      // Preserve existing context data, will use fallback
    }

    return this.state;
  }

  private updateContext(event: ConversationEvent): void {
    switch (event.type) {
      case "PHOTO_UPLOAD_COMPLETE":
        this.context.imageUrl = event.imageUrl;
        this.context.exifMetadata = event.exif;
        break;
      case "VISION_ANALYSIS_COMPLETE":
        this.context.visionResult = event.result;
        break;
      case "USER_RESPONSE":
        this.context.userText = event.text;
        break;
      case "EMOTION_ANALYSIS_COMPLETE":
        this.context.emotionResult = event.result;
        break;
      case "COMMENT_GENERATED":
        this.context.aiComment = event.comment;
        break;
    }
  }
}
