import { describe, expect, it } from 'vitest';
import {
  buildCalendarDayDots,
  buildCalendarEmotionDots,
  buildCalendarReclassifyAccordionState,
  buildCalendarSheetHeaderStyle,
  buildCalendarTimelineStyle,
  buildReclassifyBottomTabStyle,
  buildReclassifyEmotionPickerStyle,
  buildReclassifyReflectionBlockStyle,
  buildReclassifyReflectionSubmitStyle,
  buildReclassifyReflectionSummaryStyle,
  buildReclassifySecondaryActionStyle,
  buildRecordGemBadges,
  buildRecordReflectionSectionStyle,
  buildRecordTextSectionStyle,
  buildRecordReflection,
  calendarRecordEmotionCode,
  calendarRecordEmotionCodes,
  calendarRecordNeedsReclassification,
  dayQuestionStatus,
} from './Calendar';
import type { RecordDto } from '../lib/api';
import type { Gem } from '../types/gem';

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

function gem(id: string, emotionCode: string): Gem {
  return {
    id,
    emotionCode,
    tier: 1,
    createdAt: '2026-05-18T10:00:00.000Z',
    consumedAt: null,
  };
}

describe('Calendar record reclassification helpers', () => {
  it('treats past unconfirmed/plain records as unclassified reclassification candidates', () => {
    expect(calendarRecordNeedsReclassification(baseRecord)).toBe(true);
    expect(calendarRecordEmotionCode(baseRecord)).toBeNull();
    expect(calendarRecordEmotionCodes(baseRecord)).toEqual([]);
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

  it('keeps record content first and places the self-awareness question in a clear box below it', () => {
    expect(buildRecordTextSectionStyle(true)).toMatchObject({
      marginTop: 0,
      marginBottom: 10,
    });
    expect(buildRecordTextSectionStyle(false)).toMatchObject({
      marginTop: 0,
      marginBottom: 0,
    });
    expect(buildRecordReflectionSectionStyle()).toMatchObject({
      marginTop: 8,
      padding: '10px 11px',
      border: '1px solid rgba(61, 96, 80, 0.14)',
      borderRadius: 12,
      background: 'rgba(255, 255, 255, 0.62)',
    });
  });

  it('does not render an empty reflection block when the record has no question', () => {
    expect(buildRecordReflection(baseRecord)).toBeNull();
  });

  it('opens unclassified records directly on emotion selection without self-awareness reflection', () => {
    expect(buildCalendarReclassifyAccordionState(baseRecord, false)).toEqual({
      needsReflection: false,
      pickerOpen: true,
      pickerToggleLabel: null,
      emotionLabel: '이 기록의 감정을 골라주세요',
    });
  });

  it('keeps confirmed records in reflection-first mode and labels the next step as 작성완료', () => {
    const confirmed: RecordDto = {
      ...baseRecord,
      classificationStatus: 'user_confirmed',
      confirmedEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy'],
      gemEmotionCode: 'joy',
      gemId: 'gem-joy',
    };

    expect(buildCalendarReclassifyAccordionState(confirmed, false)).toEqual({
      needsReflection: true,
      pickerOpen: false,
      pickerToggleLabel: '작성완료',
      emotionLabel: '이 원석의 감정을 다시 골라주세요',
    });
  });

  it('uses split actions for reflection completion and emotion reclassification', () => {
    const confirmedRecord: RecordDto = {
      ...baseRecord,
      classificationStatus: 'user_confirmed',
      confirmedEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy'],
      gemEmotionCode: 'joy',
      gemId: 'gem-joy',
    };

    expect(buildCalendarReclassifyAccordionState(confirmedRecord, false)).toEqual({
      needsReflection: true,
      pickerOpen: false,
      pickerToggleLabel: '작성완료',
      emotionLabel: '이 원석의 감정을 다시 골라주세요',
    });
    expect(buildReclassifySecondaryActionStyle()).toMatchObject({
      background: '#F4E8CD',
      color: '#1E3328',
      borderRadius: 99,
    });
  });

  it('makes 작성완료 light green before typing and dark green after typing', () => {
    expect(buildReclassifyReflectionSubmitStyle('', false)).toMatchObject({
      background: 'rgba(225, 237, 226, 0.74)',
      color: 'rgba(61, 96, 80, 0.72)',
      cursor: 'default',
    });
    expect(buildReclassifyReflectionSubmitStyle('오늘은 꽤 단단했다', false)).toMatchObject({
      background: 'rgba(61, 96, 80, 0.96)',
      color: '#FFFFFF',
      cursor: 'pointer',
    });
    expect(buildReclassifyReflectionSubmitStyle('오늘은 꽤 단단했다', true)).toMatchObject({
      display: 'none',
    });
  });

  it('adds breathing room before the emotion picker after the reflection controls', () => {
    expect(buildReclassifyEmotionPickerStyle(true)).toMatchObject({
      marginTop: 14,
    });
    expect(buildReclassifyEmotionPickerStyle(false)).toMatchObject({
      marginTop: 0,
    });
  });

  it('uses a wider vertical gap between records in the date popup', () => {
    expect(buildCalendarTimelineStyle().gap).toBe(18);
  });

  it('uses a contextual filled CTA style for the 작성완료 step', () => {
    expect(buildReclassifyBottomTabStyle()).toMatchObject({
      background: 'rgba(61, 96, 80, 0.96)',
      color: '#FFFFFF',
      boxShadow: '0 8px 18px rgba(30, 51, 40, 0.18)',
    });
  });

  it('uses a completed green state for the one-line reflection box after 작성완료', () => {
    expect(buildReclassifyReflectionBlockStyle(false)).toMatchObject({
      background: 'rgba(255, 255, 255, 0.72)',
      border: '1px solid rgba(86, 71, 48, 0.08)',
    });
    expect(buildReclassifyReflectionBlockStyle(true)).toMatchObject({
      background: 'rgba(225, 237, 226, 0.86)',
      border: '1px solid rgba(61, 96, 80, 0.18)',
      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.2)',
    });
    expect(buildReclassifyReflectionSummaryStyle()).toMatchObject({
      background: 'rgba(61, 96, 80, 0.08)',
      border: '1px solid rgba(61, 96, 80, 0.14)',
    });
  });

  it('keeps the date popup header sticky while records scroll', () => {
    expect(buildCalendarSheetHeaderStyle()).toMatchObject({
      position: 'sticky',
      top: 0,
      zIndex: 3,
      background: '#A0BCA8',
    });
  });
});

describe('Calendar record gem badges', () => {
  it('keeps unconfirmed records as an unclassified gemstone instead of showing the AI guess', () => {
    const badges = buildRecordGemBadges(baseRecord);

    expect(badges).toEqual([
      {
        gem: {
          id: 'record-1-unclassified-0',
          emotionCode: 'unclassified',
          tier: 1,
          createdAt: '2026-05-18T10:00:00.000Z',
          consumedAt: null,
        },
        label: '미분류',
      },
    ]);
  });

  it('builds gemstone badge view models for confirmed calendar records', () => {
    const badges = buildRecordGemBadges({
      ...baseRecord,
      id: 9,
      classificationStatus: 'user_confirmed',
      confirmedEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy'],
      gemEmotionCode: 'joy',
      gemId: 'gem-joy',
    });

    expect(badges).toEqual([
      {
        gem: {
          id: 'gem-joy',
          emotionCode: 'joy',
          tier: 1,
          createdAt: '2026-05-18T10:00:00.000Z',
          consumedAt: null,
        },
        label: '기쁨',
      },
    ]);
  });

  it('builds one gemstone badge per confirmed emotion for multi-emotion records', () => {
    const badges = buildRecordGemBadges({
      ...baseRecord,
      id: 10,
      classificationStatus: 'reclassified',
      confirmedEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy', 'pride'],
      gemEmotionCode: 'joy',
      gemId: 'gem-multi',
    });

    expect(badges.map((badge) => badge.gem.emotionCode)).toEqual(['joy', 'pride']);
    expect(badges.map((badge) => badge.label)).toEqual(['기쁨', '뿌듯']);
  });

  it('uses detailed chatbot gem labels when representative emotion codes are duplicated', () => {
    const badges = buildRecordGemBadges({
      ...baseRecord,
      id: 20,
      classificationStatus: 'user_confirmed',
      confirmedEmotionCode: 'regret',
      confirmedEmotionCodes: ['regret'],
      gemEmotionCode: 'regret',
      gemId: 'gem-regret',
      detailedEmotionBadges: [
        { code: 'regret', label: '혼란스러움', gem: '혼란스러움 조각' },
        { code: 'regret', label: '후회', gem: '후회 조각' },
      ],
    });

    expect(badges.map((badge) => badge.gem.emotionCode)).toEqual(['regret', 'regret']);
    expect(badges.map((badge) => badge.label)).toEqual(['혼란스러움', '후회']);
    expect(badges.map((badge) => badge.gem.id)).toEqual(['gem-regret', 'record-20-regret-1']);
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

describe('Calendar day emotion dots', () => {
  it('represents one dot per collected emotion on that day, including multi-emotion records', () => {
    const records: RecordDto[] = [
      {
        ...baseRecord,
        id: 11,
        classificationStatus: 'reclassified',
        confirmedEmotionCode: 'joy',
        confirmedEmotionCodes: ['joy', 'pride'],
        gemEmotionCode: 'joy',
        gemId: 'gem-multi',
      },
      {
        ...baseRecord,
        id: 12,
        classificationStatus: 'user_confirmed',
        confirmedEmotionCode: 'flutter',
        confirmedEmotionCodes: ['flutter'],
        gemEmotionCode: 'flutter',
        gemId: 'gem-flutter',
      },
    ];

    expect(buildCalendarDayDots([], records).map((dot) => dot.label)).toEqual(['기쁨', '뿌듯', '설렘']);
  });

  it('keeps unconfirmed records as unclassified entries instead of using the AI guess', () => {
    expect(buildCalendarDayDots([], [baseRecord])).toEqual([
      {
        id: 'record-1-unclassified-0',
        emotionCode: 'unclassified',
        color: '#7B95A8',
        label: '미분류',
      },
    ]);
  });

  it('represents day gems as gem-shaped entries (id/emotionCode/color/label)', () => {
    const dots = buildCalendarEmotionDots([
      gem('g1', 'sadness'),
      gem('g2', 'pride'),
      gem('g3', 'flutter'),
      gem('g4', 'serenity'),
      gem('g5', 'joy'),
    ]);

    expect(dots).toEqual([
      { id: 'g1', emotionCode: 'sadness', color: '#1F3F8C', label: '슬픔' },
      { id: 'g2', emotionCode: 'pride', color: '#D6A63A', label: '뿌듯' },
      { id: 'g3', emotionCode: 'flutter', color: '#BF7D26', label: '설렘' },
      { id: 'g4', emotionCode: 'serenity', color: '#2F343B', label: '평온' },
    ]);
  });

  it('uses the neutral unclassified color when an emotion code is unknown', () => {
    expect(buildCalendarEmotionDots([gem('g1', 'unknown')])).toEqual([
      { id: 'g1', emotionCode: 'unknown', color: '#7B95A8', label: 'unknown' },
    ]);
  });
});
