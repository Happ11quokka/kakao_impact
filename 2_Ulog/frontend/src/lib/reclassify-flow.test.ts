import { describe, expect, it } from 'vitest';
import { buildRecordReclassifyAction } from './reclassify-flow';
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
      label: '감정 자세히보기',
      ariaLabel: '감정 자세히보기 아코디언 열기',
      interaction: 'reclassify',
    });
  });
});
