import { describe, expect, it } from 'vitest';
import {
  buildAnalysisItems,
  buildAnalysisReflectionSubmitStyle,
  buildRecapThemes,
  dateInAnalysisPeriod,
  formatAnalysisPeriodLabel,
  pickReflectionPrompt,
  type AnalysisItem,
} from './Analysis';
import type { ChatbotRecordDto } from '../lib/api';
import type { Gem } from '../types/gem';

const today = new Date('2026-05-19T12:00:00.000Z');

const baseGem: Gem = {
  id: 'gem-1',
  emotionCode: 'joy',
  tier: 1,
  createdAt: '2026-05-18T09:00:00.000Z',
};

const baseRecord: ChatbotRecordDto = {
  id: 101,
  gem: '기쁨 원석',
  recordText: '햇빛이 좋아서 산책했다.',
  hasPhoto: true,
  imageUrl: 'https://example.com/walk.jpg',
  aiGems: '기쁨 원석',
  createdAt: '2026-05-18T10:00:00.000Z',
};

describe('Analysis period helpers', () => {
  it('includes only dates inside the selected custom range', () => {
    const range = { start: '2026-05-10', end: '2026-05-12' };

    expect(dateInAnalysisPeriod(new Date('2026-05-10T00:00:00.000Z'), 'custom', today, range)).toBe(true);
    expect(dateInAnalysisPeriod(new Date('2026-05-12T23:59:00.000Z'), 'custom', today, range)).toBe(true);
    expect(dateInAnalysisPeriod(new Date('2026-05-13T00:00:00.000Z'), 'custom', today, range)).toBe(false);
  });
});

describe('Analysis record enrichment', () => {
  it('attaches chatbot record text and photo URL to gems from the same date', () => {
    const [item] = buildAnalysisItems([baseGem], [baseRecord], 'weekly', today);

    expect(item.recordText).toBe('햇빛이 좋아서 산책했다.');
    expect(item.imageUrl).toBe('https://example.com/walk.jpg');
  });

  it('keeps sibling emotion badges together for multi-emotion recap rows', () => {
    const gems: Gem[] = [
      { ...baseGem, id: 'gem-joy', emotionCode: 'joy', sourceMessageId: '102' },
      { ...baseGem, id: 'gem-pride', emotionCode: 'pride', sourceMessageId: '102' },
      { ...baseGem, id: 'gem-flutter', emotionCode: 'flutter', sourceMessageId: '102' },
    ];

    const items = buildAnalysisItems(gems, [{ ...baseRecord, id: 102 }], 'weekly', today);

    expect(items[0].emotionBadges).toEqual([
      { code: 'joy', label: '기쁨' },
      { code: 'pride', label: '뿌듯' },
      { code: 'flutter', label: '설렘' },
    ]);
  });

  it('uses sourceChatbotId to attach the exact chatbot record instead of falling back to a same-date record', () => {
    const gems: Gem[] = [
      { ...baseGem, id: 'gem-exact', emotionCode: 'pride', sourceChatbotId: 202 },
    ];
    const records: ChatbotRecordDto[] = [
      { ...baseRecord, id: 201, recordText: '같은 날의 다른 기록', imageUrl: null },
      { ...baseRecord, id: 202, recordText: '챗봇에서 실제로 채집한 뿌듯함 기록', imageUrl: 'https://example.com/exact.jpg' },
    ];

    const [item] = buildAnalysisItems(gems, records, 'weekly', today);

    expect(item.recordText).toBe('챗봇에서 실제로 채집한 뿌듯함 기록');
    expect(item.imageUrl).toBe('https://example.com/exact.jpg');
  });

  it('preserves original chatbot gem labels when analysis items share a representative emotion code', () => {
    const gems: Gem[] = [
      { ...baseGem, id: 'gem-confusion', emotionCode: 'regret', sourceChatbotId: 301 },
      { ...baseGem, id: 'gem-regret', emotionCode: 'regret', sourceChatbotId: 302 },
    ];
    const records: ChatbotRecordDto[] = [
      { ...baseRecord, id: 301, gem: '혼란스러움 조각', recordText: '복잡한 하루였다.', createdAt: '2026-05-18T10:00:01.000Z' },
      { ...baseRecord, id: 302, gem: '후회 조각', recordText: '복잡한 하루였다.', createdAt: '2026-05-18T10:00:02.000Z' },
    ];

    const items = buildAnalysisItems(gems, records, 'weekly', today);

    expect(items.map((item) => item.label)).toEqual(['혼란스러움', '후회']);
    expect(items[0].emotionBadges).toEqual([
      { code: 'regret', label: '혼란스러움' },
      { code: 'regret', label: '후회' },
    ]);
  });
});

describe('Analysis recap themes', () => {
  const items: AnalysisItem[] = [
    {
      id: 'item-joy-1',
      emotionCode: 'joy',
      category: 'joy',
      label: '즐거움',
      color: '#D4B84E',
      createdAt: '2026-05-18T09:00:00.000Z',
      recordText: '친구와 커피를 마셨다.',
      imageUrl: 'https://example.com/coffee.jpg',
    },
    {
      id: 'item-joy-2',
      emotionCode: 'joy',
      category: 'joy',
      label: '편안',
      color: '#D4B84E',
      createdAt: '2026-05-17T09:00:00.000Z',
      recordText: '오후가 잔잔했다.',
    },
    {
      id: 'item-sadness-1',
      emotionCode: 'sadness',
      category: 'sadness',
      label: '우울',
      color: '#58728E',
      createdAt: '2026-05-16T09:00:00.000Z',
      recordText: '하루가 무거웠다.',
    },
    {
      id: 'item-complex-1',
      emotionCode: 'regret',
      category: 'complex',
      label: '후회',
      color: '#3D3A34',
      createdAt: '2026-05-15T09:00:00.000Z',
      recordText: '회의에서 말을 아꼈다.',
    },
  ];

  it('orders slides positive (joy) first then negative categories', () => {
    const themes = buildRecapThemes(items);

    expect(themes.map((t) => t.category)).toEqual(['joy', 'sadness', 'complex']);
    expect(themes[0].title).toBe('웃음이 가장 많았던 순간이에요');
    expect(themes[1].title).toBe('위로가 필요했던 순간이에요');
  });

  it('skips categories with no records', () => {
    const themes = buildRecapThemes(items.filter((i) => i.category === 'joy'));

    expect(themes).toHaveLength(1);
    expect(themes[0].category).toBe('joy');
  });

  it('returns empty array when no items', () => {
    expect(buildRecapThemes([])).toEqual([]);
  });

  it('sorts records within a category by most recent first', () => {
    const themes = buildRecapThemes(items);
    const joy = themes.find((t) => t.category === 'joy');

    expect(joy?.records[0].id).toBe('item-joy-1');
    expect(joy?.records[1].id).toBe('item-joy-2');
  });

  it('deduplicates multi-emotion gems from the same source message into one recap moment', () => {
    const themes = buildRecapThemes([
      { ...items[0], id: 'joy-102', emotionCode: 'joy', label: '기쁨', sourceMessageId: '102' },
      { ...items[0], id: 'pride-102', emotionCode: 'pride', label: '뿌듯', sourceMessageId: '102' },
      { ...items[0], id: 'flutter-102', emotionCode: 'flutter', label: '설렘', sourceMessageId: '102' },
    ]);

    expect(themes[0].records).toHaveLength(1);
  });

  it('keeps same-code detailed labels inside one recap moment', () => {
    const themes = buildRecapThemes([
      { ...items[3], id: 'confusion-102', emotionCode: 'regret', label: '혼란스러움', recordText: '복잡한 하루였다.' },
      { ...items[3], id: 'regret-102', emotionCode: 'regret', label: '후회', recordText: '복잡한 하루였다.' },
    ]);

    expect(themes[0].records).toHaveLength(1);
    expect(themes[0].records[0].label).toBe('혼란스러움·후회');
    expect(themes[0].records[0].emotionBadges).toEqual([
      { code: 'regret', label: '혼란스러움' },
      { code: 'regret', label: '후회' },
    ]);
  });

  it('deduplicates items that share the same record text on the same day (different source messages)', () => {
    // 시간은 UTC 09:00~13:00 사이로 잡아 한국 표준시(UTC+9) 기준으로도 모두 같은 일자(2026-05-19) 안에 있도록 한다.
    const themes = buildRecapThemes([
      {
        ...items[0],
        id: 'joy-msg-A',
        sourceMessageId: 'msg-A',
        createdAt: '2026-05-19T09:00:00.000Z',
        recordText: '오늘 공부하면서 힘들었어',
      },
      {
        ...items[0],
        id: 'joy-msg-B',
        sourceMessageId: 'msg-B',
        createdAt: '2026-05-19T11:00:00.000Z',
        recordText: '오늘 공부하면서 힘들었어',
      },
      {
        ...items[0],
        id: 'joy-msg-C',
        sourceMessageId: 'msg-C',
        createdAt: '2026-05-19T13:00:00.000Z',
        recordText: '오늘 공부하면서 힘들었어',
      },
    ]);

    expect(themes[0].records).toHaveLength(1);
  });

  it('keeps items separate when text matches but the day differs', () => {
    const themes = buildRecapThemes([
      {
        ...items[0],
        id: 'joy-day1',
        sourceMessageId: 'msg-1',
        createdAt: '2026-05-18T09:00:00.000Z',
        recordText: '같은 문장',
      },
      {
        ...items[0],
        id: 'joy-day2',
        sourceMessageId: 'msg-2',
        createdAt: '2026-05-19T09:00:00.000Z',
        recordText: '같은 문장',
      },
    ]);

    expect(themes[0].records).toHaveLength(2);
  });
});

describe('Analysis reflection button style', () => {
  it('uses a dark primary color even when enabled', () => {
    expect(buildAnalysisReflectionSubmitStyle(false).background).toBe('#2F5F46');
  });
});

describe('Analysis reflection prompt', () => {
  it('prefers the most recent unanswered question', () => {
    const records: ChatbotRecordDto[] = [
      { ...baseRecord, id: 1, questionText: '오래된 답완 질문', answerText: '답이 있어요', createdAt: '2026-05-10T09:00:00.000Z' },
      { ...baseRecord, id: 2, questionText: '최근 미답 질문', answerText: null, createdAt: '2026-05-18T09:00:00.000Z' },
    ];

    const prompt = pickReflectionPrompt(records);

    expect(prompt.source).toBe('unanswered');
    expect(prompt.question).toBe('최근 미답 질문');
  });

  it('falls back to most recent answered question', () => {
    const records: ChatbotRecordDto[] = [
      { ...baseRecord, id: 1, questionText: '답한 질문 1', answerText: '답 1', createdAt: '2026-05-10T09:00:00.000Z' },
      { ...baseRecord, id: 2, questionText: '답한 질문 2 (최신)', answerText: '답 2', createdAt: '2026-05-18T09:00:00.000Z' },
    ];

    const prompt = pickReflectionPrompt(records);

    expect(prompt.source).toBe('answered');
    expect(prompt.question).toBe('답한 질문 2 (최신)');
    expect(prompt.answer).toBe('답 2');
  });

  it('uses static prompt when no question records exist', () => {
    const prompt = pickReflectionPrompt([baseRecord]);

    expect(prompt.source).toBe('static');
    expect(prompt.question.length).toBeGreaterThan(0);
  });

  it('prefers dynamicQuestion option over unanswered chatbot question', () => {
    const records: ChatbotRecordDto[] = [
      { ...baseRecord, id: 1, questionText: '미답 질문', answerText: null, createdAt: '2026-05-18T09:00:00.000Z' },
    ];

    const prompt = pickReflectionPrompt(records, { dynamicQuestion: '주 감정 기반 질문이에요?' });

    expect(prompt.source).toBe('dynamic');
    expect(prompt.question).toBe('주 감정 기반 질문이에요?');
  });

  it('falls back to chatbot priority when dynamicQuestion is null', () => {
    const records: ChatbotRecordDto[] = [
      { ...baseRecord, id: 1, questionText: '미답 질문', answerText: null, createdAt: '2026-05-18T09:00:00.000Z' },
    ];

    const prompt = pickReflectionPrompt(records, { dynamicQuestion: null });

    expect(prompt.source).toBe('unanswered');
    expect(prompt.question).toBe('미답 질문');
  });
});

describe('formatAnalysisPeriodLabel', () => {
  it('renders weekly as "<달>월 <몇째>주차" using a Sunday-start calendar week', () => {
    // 2026-06-10: 6월 1일이 월요일 → ceil((10+1)/7)=2
    expect(formatAnalysisPeriodLabel('weekly', new Date(2026, 5, 10))).toBe('6월 2주차');
    // 6월 1일(월) 본인 → 1주차
    expect(formatAnalysisPeriodLabel('weekly', new Date(2026, 5, 1))).toBe('6월 1주차');
  });

  it('renders monthly as "YYYY-MM"', () => {
    expect(formatAnalysisPeriodLabel('monthly', new Date(2026, 5, 10))).toBe('2026-06');
    expect(formatAnalysisPeriodLabel('monthly', new Date(2026, 0, 3))).toBe('2026-01');
  });

  it('renders custom as the start~end range', () => {
    expect(
      formatAnalysisPeriodLabel('custom', new Date(2026, 5, 10), { start: '2026-05-28', end: '2026-06-10' }),
    ).toBe('2026-05-28 ~ 2026-06-10');
  });
});
