import { EmotionAnalysisDataSchema } from "@/types/schemas";
import type { EmotionAnalysisData } from "@/types";

export function serialize(data: EmotionAnalysisData): string {
  return JSON.stringify(data);
}

export function deserialize(json: string): EmotionAnalysisData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(
      `JSON 파싱 실패: ${e instanceof Error ? e.message : "유효하지 않은 JSON 형식입니다"}`
    );
  }

  const result = EmotionAnalysisDataSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new Error(
      `유효성 검증 실패: 필드 '${issue.path.join(".")}' - ${issue.message}`
    );
  }

  return result.data;
}
