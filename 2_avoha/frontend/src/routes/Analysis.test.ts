import { describe, expect, it } from 'vitest';
import {
  buildAnalysisItems,
  buildPatternPanelState,
  buildRecapDialogState,
  buildRecapThemes,
  dateInAnalysisPeriod,
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

describe('Analysis pattern panel', () => {
  it('keeps the pattern visualization open and sized as the primary viewport section', () => {
    const panel = buildPatternPanelState(5);

    expect(panel.expanded).toBe(true);
    expect(panel.toggleLabel).toBeNull();
    expect(panel.layoutRole).toBe('primary-fill');
    expect(panel.minVisibleRows).toBe(5);
  });
});

describe('Analysis recap themes', () => {
  it('builds selectable recap themes with related records', () => {
    const items: AnalysisItem[] = [
      {
        id: 'item-1',
        emotionCode: 'joy',
        category: 'joy',
        label: '즐거움',
        color: '#D4B84E',
        createdAt: '2026-05-18T09:00:00.000Z',
        recordText: '친구와 커피를 마셨다.',
        imageUrl: 'https://example.com/coffee.jpg',
      },
      {
        id: 'item-2',
        emotionCode: 'regret',
        category: 'complex',
        label: '후회',
        color: '#3D3A34',
        createdAt: '2026-05-17T09:00:00.000Z',
        recordText: '회의에서 말을 아꼈다.',
      },
    ];

    const themes = buildRecapThemes(items, '이번 주');

    expect(themes.length).toBeGreaterThanOrEqual(3);
    expect(themes[0].title).toContain('이번 주');
    expect(themes.some((theme) => theme.title.includes('사진'))).toBe(true);
    expect(themes.flatMap((theme) => theme.records).some((record) => record.imageUrl?.includes('coffee'))).toBe(true);
  });

  it('prepares a popup dialog state instead of requiring inline recap records', () => {
    const items: AnalysisItem[] = [
      {
        id: 'item-1',
        emotionCode: 'joy',
        category: 'joy',
        label: '즐거움',
        color: '#D4B84E',
        createdAt: '2026-05-18T09:00:00.000Z',
        recordText: '친구와 커피를 마셨다.',
        imageUrl: 'https://example.com/coffee.jpg',
      },
    ];
    const [theme] = buildRecapThemes(items, '이번 주');

    const dialog = buildRecapDialogState(theme);

    expect(dialog?.title).toBe(theme.title);
    expect(dialog?.records).toHaveLength(1);
    expect(dialog?.emptyMessage).toContain('기록');
    expect(buildRecapDialogState(null)).toBeNull();
  });
});
