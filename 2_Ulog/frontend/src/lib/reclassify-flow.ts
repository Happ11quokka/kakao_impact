import type { RecordDto } from './api';

export type ReclassifyInteraction = 'confirm' | 'reclassify';

export type RecordReclassifyAction = {
  label: string;
  ariaLabel: string;
  interaction: ReclassifyInteraction;
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
    label: confirmed ? '감정 자세히보기' : '감정 분류하기',
    ariaLabel: confirmed ? '감정 자세히보기 아코디언 열기' : '감정 분류 아코디언 열기',
    interaction: confirmed ? 'reclassify' : 'confirm',
  };
}
