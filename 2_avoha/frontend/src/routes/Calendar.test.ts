import { describe, expect, it } from 'vitest';
import { calendarRecordEmotionCode, calendarRecordNeedsReclassification } from './Calendar';
import type { RecordDto } from '../lib/api';

const baseRecord: RecordDto = {
  id: 1,
  gem: '일상기록',
  recordText: '어제 적어둔 감정 미분류 기록',
  hasPhoto: false,
  imageUrl: null,
  aiGems: null,
  createdAt: '2026-05-18T10:00:00.000Z',
  entryMode: 'plain_record',
  classificationStatus: 'needs_confirmation',
  aiEmotionCode: 'regret',
  confirmedEmotionCode: null,
  confirmedAt: null,
  webReviewedAt: null,
  updatedAt: '2026-05-18T10:00:00.000Z',
  gemId: null,
  gemEmotionCode: null,
};

describe('Calendar record reclassification helpers', () => {
  it('treats past unconfirmed/plain records as reclassification candidates', () => {
    expect(calendarRecordNeedsReclassification(baseRecord)).toBe(true);
    expect(calendarRecordEmotionCode(baseRecord)).toBe('regret');
  });

  it('does not require reclassification after a record has been confirmed', () => {
    const confirmed: RecordDto = {
      ...baseRecord,
      classificationStatus: 'user_confirmed',
      confirmedEmotionCode: 'joy',
      gemEmotionCode: 'joy',
      gemId: 'gem-1',
    };

    expect(calendarRecordNeedsReclassification(confirmed)).toBe(false);
    expect(calendarRecordEmotionCode(confirmed)).toBe('joy');
  });
});
