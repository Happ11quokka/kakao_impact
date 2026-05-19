import { describe, expect, it } from 'vitest';
import {
  buildActiveRecordGemBadges,
  buildHomeStoneGemLayout,
  buildTodayCategoryGemSlots,
} from './Home';
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

const today = new Date('2026-05-19T12:00:00.000Z');

function makeConfirmed(overrides: Partial<RecordDto> & { id: number; codes: string[] }): RecordDto {
  return {
    ...baseRecord,
    id: overrides.id,
    createdAt: overrides.createdAt ?? '2026-05-19T10:00:00.000Z',
    updatedAt: overrides.createdAt ?? '2026-05-19T10:00:00.000Z',
    classificationStatus: 'user_confirmed',
    confirmedEmotionCode: overrides.codes[0],
    confirmedEmotionCodes: overrides.codes,
    gemEmotionCode: overrides.codes[0],
    gemId: `gem-${overrides.id}`,
  };
}

describe('Home today category gem slots', () => {
  it('always returns one slot per category, defaulting to count 0', () => {
    const slots = buildTodayCategoryGemSlots([], today);
    expect(slots.map((slot) => slot.category).sort()).toEqual(
      ['anger', 'anxiety', 'complex', 'joy', 'sadness'],
    );
    expect(slots.every((slot) => slot.count === 0)).toBe(true);
    expect(slots.every((slot) => slot.records.length === 0)).toBe(true);
  });

  it('excludes unconfirmed records from category counts', () => {
    const slots = buildTodayCategoryGemSlots([baseRecord], today);
    const joy = slots.find((slot) => slot.category === 'joy');
    expect(joy?.count).toBe(0);
  });

  it('deduplicates within a single record so joy + pride counts as joy ×1', () => {
    const record = makeConfirmed({ id: 2, codes: ['joy', 'pride'] });
    const slots = buildTodayCategoryGemSlots([record], today);
    const joy = slots.find((slot) => slot.category === 'joy');
    expect(joy?.count).toBe(1);
    expect(joy?.records).toEqual([record]);
  });

  it('spreads multi-category emotions across categories', () => {
    const record = makeConfirmed({ id: 3, codes: ['joy', 'sadness'] });
    const slots = buildTodayCategoryGemSlots([record], today);
    expect(slots.find((s) => s.category === 'joy')?.count).toBe(1);
    expect(slots.find((s) => s.category === 'sadness')?.count).toBe(1);
  });

  it('sorts by count desc, breaking ties in joy → sadness → anger → anxiety → complex order', () => {
    const records = [
      makeConfirmed({ id: 10, codes: ['joy'], createdAt: '2026-05-19T09:00:00.000Z' }),
      makeConfirmed({ id: 11, codes: ['sadness'], createdAt: '2026-05-19T09:10:00.000Z' }),
      makeConfirmed({ id: 12, codes: ['annoyance'], createdAt: '2026-05-19T09:20:00.000Z' }),
      makeConfirmed({ id: 13, codes: ['joy'], createdAt: '2026-05-19T09:30:00.000Z' }),
    ];
    const slots = buildTodayCategoryGemSlots(records, today);
    expect(slots.map((slot) => slot.category)).toEqual([
      'joy',
      'sadness',
      'anger',
      'anxiety',
      'complex',
    ]);
    expect(slots.map((slot) => slot.count)).toEqual([2, 1, 1, 0, 0]);
  });

  it('orders records within a category by createdAt ascending', () => {
    const records = [
      makeConfirmed({ id: 20, codes: ['joy'], createdAt: '2026-05-19T11:00:00.000Z' }),
      makeConfirmed({ id: 21, codes: ['joy'], createdAt: '2026-05-19T03:00:00.000Z' }),
    ];
    const slots = buildTodayCategoryGemSlots(records, today);
    const joy = slots.find((slot) => slot.category === 'joy');
    expect(joy?.records.map((r) => r.id)).toEqual([21, 20]);
  });
});

describe('Home stone + active record helpers', () => {
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
});
