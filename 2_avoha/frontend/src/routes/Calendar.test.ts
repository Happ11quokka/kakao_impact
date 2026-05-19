import { describe, expect, it } from 'vitest';
import {
  buildRecordReflection,
  calendarRecordEmotionCode,
  calendarRecordEmotionCodes,
  calendarRecordNeedsReclassification,
  dayQuestionStatus,
} from './Calendar';
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
  confirmedEmotionCodes: [],
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
    expect(calendarRecordEmotionCodes(baseRecord)).toEqual(['regret']);
  });

  it('does not require reclassification after a record has been confirmed', () => {
    const confirmed: RecordDto = {
      ...baseRecord,
      classificationStatus: 'user_confirmed',
      confirmedEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy'],
      gemEmotionCode: 'joy',
      gemId: 'gem-1',
    };

    expect(calendarRecordNeedsReclassification(confirmed)).toBe(false);
    expect(calendarRecordEmotionCode(confirmed)).toBe('joy');
    expect(calendarRecordEmotionCodes(confirmed)).toEqual(['joy']);
  });

  it('returns every confirmed emotion code for multi-emotion records', () => {
    const multi: RecordDto = {
      ...baseRecord,
      classificationStatus: 'reclassified',
      confirmedEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy', 'pride', 'flutter'],
      gemEmotionCode: 'joy',
      gemId: 'gem-multi',
    };

    expect(calendarRecordEmotionCodes(multi)).toEqual(['joy', 'pride', 'flutter']);
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

describe('Calendar day question status', () => {
  it('returns none when no record has a question', () => {
    expect(dayQuestionStatus([baseRecord])).toBe('none');
    expect(dayQuestionStatus([])).toBe('none');
  });

  it('returns answered when at least one question is answered', () => {
    const answered: RecordDto = {
      ...baseRecord,
      id: 2,
      questionText: '오늘 가장 또렷한 감정은?',
      answerText: '잔잔한 안도',
    };
    const unanswered: RecordDto = {
      ...baseRecord,
      id: 3,
      questionText: '다른 질문',
      answerText: null,
    };

    expect(dayQuestionStatus([answered])).toBe('answered');
    expect(dayQuestionStatus([answered, unanswered])).toBe('answered');
  });

  it('returns unanswered when all questions are still empty', () => {
    const q1: RecordDto = { ...baseRecord, id: 2, questionText: '질문 1', answerText: null };
    const q2: RecordDto = { ...baseRecord, id: 3, questionText: '질문 2', answerText: '   ' };

    expect(dayQuestionStatus([q1])).toBe('unanswered');
    expect(dayQuestionStatus([q1, q2])).toBe('unanswered');
  });
});
