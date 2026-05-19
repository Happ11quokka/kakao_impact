import { describe, expect, it } from 'vitest';
import {
  buildAnalysisItems,
  buildRecapThemes,
  dateInAnalysisPeriod,
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
});
