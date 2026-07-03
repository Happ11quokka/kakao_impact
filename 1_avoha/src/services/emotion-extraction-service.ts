import type { VisionResult, EmotionResult } from "@/types";

const DEFAULT_EMOTION_TAGS = ["기록됨"];
const DEFAULT_CONTEXT_KEYWORDS = ["일상"];

const TAG_EMOTION_MAP: Record<string, { polarity: EmotionResult["emotionPolarity"]; emotions: string[] }> = {
  "하늘": { polarity: "positive", emotions: ["편안함", "해방감"] },
  "공원": { polarity: "positive", emotions: ["편안함", "여유"] },
  "카페": { polarity: "positive", emotions: ["안정감", "여유"] },
  "커피": { polarity: "positive", emotions: ["안정감"] },
  "꽃": { polarity: "positive", emotions: ["설렘", "따뜻함"] },
  "바다": { polarity: "positive", emotions: ["해방감", "편안함"] },
  "산": { polarity: "positive", emotions: ["뿌듯함", "해방감"] },
  "음식": { polarity: "positive", emotions: ["기쁨", "따뜻함"] },
  "친구": { polarity: "positive", emotions: ["기쁨", "따뜻함"] },
  "반려동물": { polarity: "positive", emotions: ["따뜻함", "기쁨"] },
  "비": { polarity: "neutral", emotions: ["안정감"] },
  "야경": { polarity: "positive", emotions: ["설렘", "안정감"] },
};

const TEXT_KEYWORD_MAP: Record<string, string[]> = {
  "산책": ["산책", "걷"],
  "휴식": ["휴식", "쉬"],
  "커피": ["커피", "카페"],
  "운동": ["운동", "달리"],
  "독서": ["독서", "책"],
  "음악": ["음악", "노래"],
  "요리": ["요리", "만들"],
  "여행": ["여행", "떠나"],
  "친구": ["친구", "만나"],
};

function extractContextFromText(text: string): string[] {
  const keywords: string[] = [];
  for (const [keyword, patterns] of Object.entries(TEXT_KEYWORD_MAP)) {
    if (patterns.some((p) => text.includes(p))) {
      keywords.push(keyword);
    }
  }
  return keywords.length > 0 ? keywords : DEFAULT_CONTEXT_KEYWORDS;
}

function analyzeFromVisionTags(visionTags: string[]): {
  polarity: EmotionResult["emotionPolarity"];
  emotions: string[];
  contextKeywords: string[];
} {
  const emotions = new Set<string>();
  const contextKeywords = new Set<string>();
  let positiveCount = 0;
  let negativeCount = 0;

  for (const tag of visionTags) {
    const lowerTag = tag.toLowerCase();
    for (const [key, mapping] of Object.entries(TAG_EMOTION_MAP)) {
      if (lowerTag.includes(key)) {
        mapping.emotions.forEach((e) => emotions.add(e));
        if (mapping.polarity === "positive") positiveCount++;
        if (mapping.polarity === "negative") negativeCount++;
        contextKeywords.add(key);
      }
    }
  }

  const emotionArray = emotions.size > 0 ? [...emotions] : DEFAULT_EMOTION_TAGS;
  const contextArray = contextKeywords.size > 0 ? [...contextKeywords] : DEFAULT_CONTEXT_KEYWORDS;

  let polarity: EmotionResult["emotionPolarity"] = "neutral";
  if (positiveCount > negativeCount) polarity = "positive";
  else if (negativeCount > positiveCount) polarity = "negative";

  return { polarity, emotions: emotionArray, contextKeywords: contextArray };
}

export class EmotionExtractionService {
  async extractWithText(
    visionResult: VisionResult,
    userText: string
  ): Promise<EmotionResult> {
    const visionAnalysis = analyzeFromVisionTags(visionResult.visionTags);
    const textKeywords = extractContextFromText(userText);

    const mergedKeywords = [...new Set([...visionAnalysis.contextKeywords, ...textKeywords])];

    return {
      emotionPolarity: visionAnalysis.polarity,
      emotionTags: visionAnalysis.emotions,
      contextKeywords: mergedKeywords,
    };
  }

  async extractFromVisionOnly(
    visionResult: VisionResult
  ): Promise<EmotionResult> {
    const analysis = analyzeFromVisionTags(visionResult.visionTags);

    return {
      emotionPolarity: analysis.polarity,
      emotionTags: analysis.emotions,
      contextKeywords: analysis.contextKeywords,
    };
  }
}
