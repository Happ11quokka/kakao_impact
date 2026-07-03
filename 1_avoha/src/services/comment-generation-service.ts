import type { CommentInput } from "@/types";

export interface LlmClient {
  generateComment(prompt: string): Promise<string>;
}

const FALLBACK_MESSAGES: Record<string, string> = {
  "편안함": "오늘도 편안한 순간을 발견했네요. 이런 여유가 참 소중해요.",
  "설렘": "두근두근한 순간이었군요! 이런 설렘이 하루를 특별하게 만들어요.",
  "뿌듯함": "스스로를 대견하게 여길 수 있는 순간이네요. 정말 멋져요.",
  "안정감": "마음이 차분해지는 순간이었네요. 이런 안정감을 기억해두세요.",
  "해방감": "자유로운 순간을 만끽했군요! 가끔은 이런 해방감이 필요하죠.",
  "기쁨": "기쁜 순간을 기록했네요! 이 행복이 오래 기억되길 바라요.",
  "감사": "감사한 마음을 느낀 순간이네요. 참 따뜻한 하루였겠어요.",
  "여유": "여유로운 시간을 보냈군요. 이런 순간이 진짜 행복이에요.",
  "호기심": "새로운 것을 발견한 순간이네요! 호기심이 삶을 풍요롭게 해요.",
  "따뜻함": "따뜻한 순간을 담았네요. 마음까지 포근해지는 기록이에요.",
  "기록됨": "오늘의 순간을 기록했어요. 작은 일상도 돌아보면 소중하답니다.",
};

const DEFAULT_FALLBACK = "오늘의 소확행을 기록했어요. 작은 행복이 모여 큰 행복이 된답니다.";

export class CommentGenerationService {
  constructor(private client: LlmClient) {}

  async generate(input: CommentInput): Promise<string> {
    const prompt = this.buildPrompt(input);
    return this.client.generateComment(prompt);
  }

  getFallbackComment(emotionTags: string[]): string {
    if (emotionTags.length === 0) {
      return DEFAULT_FALLBACK;
    }

    const firstTag = emotionTags[0]!;
    return FALLBACK_MESSAGES[firstTag] ?? DEFAULT_FALLBACK;
  }

  private buildPrompt(input: CommentInput): string {
    const parts = [
      `사진 분석 키워드: ${input.visionTags.join(", ")}`,
      `감정 태그: ${input.emotionTags.join(", ")}`,
      `상황 키워드: ${input.contextKeywords.join(", ")}`,
    ];

    if (input.userText) {
      parts.push(`사용자 답변: ${input.userText}`);
    }
    if (input.location) {
      parts.push(`위치: (${input.location.latitude}, ${input.location.longitude})`);
    }

    return [
      "다음 소확행 기록에 대해 1~2문장의 따뜻한 감성 코멘트를 작성해주세요.",
      "과도한 상담 어조는 피하고, 자연스럽고 따뜻한 톤을 유지해주세요.",
      "",
      ...parts,
    ].join("\n");
  }
}
