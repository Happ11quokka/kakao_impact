import { describe, expect, it } from 'vitest';
import { buildReclassifyFlowState, buildRecordReclassifyAction } from './reclassify-flow';
import type { RecordDto } from './api';

const baseRecord: RecordDto = {
  id: 1,
  gem: '일상기록',
  recordText: '감정 기록',
  hasPhoto: false,
  imageUrl: null,
  aiGems: null,
  createdAt: '2026-05-18T10:00:00.000Z',
  entryMode: 'plain_record',
  classificationStatus: 'needs_confirmation',
  aiEmotionCode: 'regret',
  confirmedEmotionCode: null,
  confirmedEmotionCodes: [],
  confirmedAt: null,
  webReviewedAt: null,
  updatedAt: '2026-05-18T10:00:00.000Z',
  gemId: null,
  gemEmotionCode: null,
};

describe('reclassify flow helpers', () => {
  it('always exposes a reclassify action for both unclassified and confirmed records', () => {
    const confirmed: RecordDto = {
      ...baseRecord,
      classificationStatus: 'user_confirmed',
      confirmedEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy'],
      gemEmotionCode: 'joy',
      gemId: 'gem-joy',
    };

    expect(buildRecordReclassifyAction(baseRecord)).toEqual({
      label: '감정 분류하기',
      ariaLabel: '감정 분류 아코디언 열기',
      interaction: 'confirm',
    });
    expect(buildRecordReclassifyAction(confirmed)).toEqual({
      label: '감정 재분류하기',
      ariaLabel: '감정 재분류 아코디언 열기',
      interaction: 'reclassify',
    });
  });

  it('requires a self-awareness answer before showing the emotion picker', () => {
    expect(buildReclassifyFlowState('')).toEqual({
      question: '그 순간 가장 크게 남아 있던 느낌은 무엇에 가까웠나요?',
      answer: '',
      canChooseEmotion: false,
    });
    expect(buildReclassifyFlowState('  다시 생각해보니 안도감이 더 컸어요.  ')).toEqual({
      question: '그 순간 가장 크게 남아 있던 느낌은 무엇에 가까웠나요?',
      answer: '다시 생각해보니 안도감이 더 컸어요.',
      canChooseEmotion: false,
    });
    expect(buildReclassifyFlowState('  다시 생각해보니 안도감이 더 컸어요.  ', true)).toEqual({
      question: '그 순간 가장 크게 남아 있던 느낌은 무엇에 가까웠나요?',
      answer: '다시 생각해보니 안도감이 더 컸어요.',
      canChooseEmotion: true,
    });
  });
});
