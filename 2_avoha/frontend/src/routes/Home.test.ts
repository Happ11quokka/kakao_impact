import { describe, expect, it } from 'vitest';
import { buildActiveRecordGemBadges, buildHomeStoneGemLayout, buildReclassifyReflectionOptions, buildTodayGemBoxItems } from './Home';
import type { RecordDto } from '../lib/api';

const baseRecord: RecordDto = {
  id: 1,
  gem: '일상기록',
  recordText: '오늘 남긴 감정 기록',
  hasPhoto: false,
  imageUrl: null,
  aiGems: null,
  createdAt: '2026-05-19T09:30:00.000Z',
  entryMode: 'plain_record',
  classificationStatus: 'needs_confirmation',
  aiEmotionCode: 'regret',
  confirmedEmotionCode: null,
  confirmedEmotionCodes: [],
  confirmedAt: null,
  webReviewedAt: null,
  updatedAt: '2026-05-19T09:30:00.000Z',
  gemId: null,
  gemEmotionCode: null,
};

describe('Home today gem box items', () => {
  it('excludes unconfirmed records from the today gem box while leaving them available in the lake', () => {
    const items = buildTodayGemBoxItems([baseRecord], new Date('2026-05-19T12:00:00.000Z'));

    expect(items).toEqual([]);
  });

  it('keeps confirmed records in chronological order with their confirmed emotion label', () => {
    const confirmed: RecordDto = {
      ...baseRecord,
      id: 2,
      createdAt: '2026-05-19T10:00:00.000Z',
      classificationStatus: 'user_confirmed',
      confirmedEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy'],
      gemEmotionCode: 'joy',
      gemId: 'gem-joy',
    };
    const unconfirmedLater: RecordDto = {
      ...baseRecord,
      id: 3,
      createdAt: '2026-05-19T11:00:00.000Z',
      aiEmotionCode: 'regret',
    };

    const items = buildTodayGemBoxItems(
      [unconfirmedLater, confirmed],
      new Date('2026-05-19T12:00:00.000Z'),
    );

    expect(items.map((item) => [item.record.id, item.emotionCode, item.label, item.status])).toEqual([
      [2, 'joy', '기쁨', 'confirmed'],
    ]);
  });

  it('lays out multi-emotion home stones inside one circle without overlap', () => {
    const layout = buildHomeStoneGemLayout(['joy', 'pride', 'flutter']);

    expect(layout).toEqual([
      { code: 'joy', x: -9, y: 4, size: 16 },
      { code: 'pride', x: 9, y: 4, size: 16 },
      { code: 'flutter', x: 0, y: -10, size: 16 },
    ]);
    layout.forEach((item, index) => {
      layout.slice(index + 1).forEach((next) => {
        const centerDistance = Math.hypot(item.x - next.x, item.y - next.y);
        expect(centerDistance).toBeGreaterThanOrEqual(Math.max(item.size, next.size));
      });
    });
  });

  it('builds all confirmed emotion badges for the active recap sheet', () => {
    const multiEmotionRecord: RecordDto = {
      ...baseRecord,
      id: 4,
      classificationStatus: 'user_confirmed',
      confirmedEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy', 'pride', 'flutter'],
      gemEmotionCode: 'joy',
      gemId: 'gem-joy',
    };

    expect(buildActiveRecordGemBadges(multiEmotionRecord)).toEqual([
      { code: 'joy', label: '기쁨' },
      { code: 'pride', label: '뿌듯' },
      { code: 'flutter', label: '설렘' },
    ]);
  });

  it('requires a self-awareness question before reclassifying an already confirmed emotion', () => {
    expect(buildReclassifyReflectionOptions()).toEqual([
      { type: 'question', label: '자기인지 질문' },
    ]);
  });
});
