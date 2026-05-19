import type { RecordDto } from './api';

export const RECLASSIFY_SELF_AWARENESS_QUESTION =
  '그 순간 가장 크게 남아 있던 느낌은 무엇에 가까웠나요?';

export type ReclassifyInteraction = 'confirm' | 'reclassify';

export type RecordReclassifyAction = {
  label: string;
  ariaLabel: string;
  interaction: ReclassifyInteraction;
};

export type ReclassifyFlowState = {
  question: string;
  answer: string;
  canChooseEmotion: boolean;
};

export function recordHasConfirmedEmotion(record: RecordDto): boolean {
  return (
    record.classificationStatus !== 'needs_confirmation' &&
    (record.confirmedEmotionCodes.length > 0 ||
      Boolean(record.confirmedEmotionCode) ||
      Boolean(record.gemEmotionCode))
  );
}

export function buildRecordReclassifyAction(record: RecordDto): RecordReclassifyAction {
  const confirmed = recordHasConfirmedEmotion(record);
  return {
    label: confirmed ? '감정 재분류하기' : '감정 분류하기',
    ariaLabel: confirmed ? '감정 재분류 아코디언 열기' : '감정 분류 아코디언 열기',
    interaction: confirmed ? 'reclassify' : 'confirm',
  };
}

export function buildReclassifyFlowState(
  answerText: string,
  answerSubmitted = false,
): ReclassifyFlowState {
  const answer = answerText.trim();
  return {
    question: RECLASSIFY_SELF_AWARENESS_QUESTION,
    answer,
    canChooseEmotion: answer.length > 0 && answerSubmitted,
  };
}
