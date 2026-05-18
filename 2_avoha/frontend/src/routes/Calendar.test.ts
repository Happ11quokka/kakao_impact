import { describe, expect, it } from 'vitest';
import { buildRecordReflection, calendarRecordEmotionCode, calendarRecordNeedsReclassification } from './Calendar';
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

  it('keeps chatbot self-awareness question and answer with the calendar record detail', () => {
    const reflection = buildRecordReflection({
      ...baseRecord,
      questionText: '그 순간 가장 크게 남아 있던 느낌은 무엇에 가까웠나요?',
      answerText: '회의 뒤에 긴장이 남아 있었어요.',
    });

    expect(reflection).toEqual({
      question: '그 순간 가장 크게 남아 있던 느낌은 무엇에 가까웠나요?',
      answer: '회의 뒤에 긴장이 남아 있었어요.',
    });
  });

  it('does not render an empty reflection block when the record has no question', () => {
    expect(buildRecordReflection(baseRecord)).toBeNull();
  });
});
