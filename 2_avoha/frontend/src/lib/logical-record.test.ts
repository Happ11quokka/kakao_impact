import { describe, expect, it } from 'vitest';
import {
  dedupeLogicalRecords,
  logicalKeyForRecord,
  logicalKeyForChatbotRecord,
} from './logical-record';
import type { ChatbotRecordDto, RecordDto } from './api';

function makeRecord(overrides: Partial<RecordDto> & { id: number }): RecordDto {
  return {
    gem: '기쁨 원석',
    recordText: '오늘 산책했다.',
    hasPhoto: false,
    imageUrl: null,
    aiGems: null,
    createdAt: '2026-05-19T09:00:00.000Z',
    entryMode: 'emotion_classification',
    classificationStatus: 'user_confirmed',
    aiEmotionCode: null,
    confirmedEmotionCode: null,
    confirmedEmotionCodes: [],
    confirmedAt: null,
    webReviewedAt: null,
    updatedAt: '2026-05-19T09:00:00.000Z',
    gemId: null,
    gemEmotionCode: null,
    ...overrides,
  };
}

describe('dedupeLogicalRecords', () => {
  it('keeps records with different text/photo as separate logical records', () => {
    const a = makeRecord({ id: 1, recordText: 'A', gemEmotionCode: 'joy' });
    const b = makeRecord({ id: 2, recordText: 'B', gemEmotionCode: 'sadness' });
    const result = dedupeLogicalRecords([a, b]);
    expect(result).toHaveLength(2);
  });

  it('preserves original chatbot gem labels when sibling rows share the same representative emotion code', () => {
    const confusion = makeRecord({
      id: 20,
      gem: '혼란스러움 조각',
      recordText: '복잡한 하루였다.',
      confirmedEmotionCode: 'regret',
      confirmedEmotionCodes: ['regret'],
      gemEmotionCode: 'regret',
      createdAt: '2026-05-19T09:00:01.000Z',
    });
    const regret = makeRecord({
      id: 21,
      gem: '후회 조각',
      recordText: '복잡한 하루였다.',
      confirmedEmotionCode: 'regret',
      confirmedEmotionCodes: ['regret'],
      gemEmotionCode: 'regret',
      createdAt: '2026-05-19T09:00:02.000Z',
    });

    const result = dedupeLogicalRecords([regret, confusion]);

    expect(result).toHaveLength(1);
    expect(result[0].confirmedEmotionCodes).toEqual(['regret']);
    expect(result[0].detailedEmotionBadges).toEqual([
      { code: 'regret', label: '혼란스러움', gem: '혼란스러움 조각' },
      { code: 'regret', label: '후회', gem: '후회 조각' },
    ]);
  });

  it('merges sibling rows that share text + photo + time bucket into one record', () => {
    const sibling1 = makeRecord({
      id: 10,
      recordText: '카페에서 행복',
      gemEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy'],
      createdAt: '2026-05-19T09:00:01.000Z',
    });
    const sibling2 = makeRecord({
      id: 11,
      recordText: '카페에서 행복',
      gemEmotionCode: 'satisfaction',
      confirmedEmotionCodes: ['satisfaction'],
      createdAt: '2026-05-19T09:00:02.000Z',
    });
    const sibling3 = makeRecord({
      id: 12,
      recordText: '카페에서 행복',
      gemEmotionCode: 'flutter',
      confirmedEmotionCodes: ['flutter'],
      createdAt: '2026-05-19T09:00:03.000Z',
    });
    const result = dedupeLogicalRecords([sibling2, sibling3, sibling1]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(10);
    expect(result[0].confirmedEmotionCodes).toEqual(['joy', 'satisfaction', 'flutter']);
  });

  it('treats records with empty text and no photo individually even at the same time', () => {
    const a = makeRecord({
      id: 1,
      recordText: '',
      hasPhoto: false,
      imageUrl: null,
      createdAt: '2026-05-19T09:00:00.000Z',
    });
    const b = makeRecord({
      id: 2,
      recordText: '',
      hasPhoto: false,
      imageUrl: null,
      createdAt: '2026-05-19T09:00:01.000Z',
    });
    const result = dedupeLogicalRecords([a, b]);
    expect(result).toHaveLength(2);
  });

  it('groups by photo URL when text is empty but a photo is attached', () => {
    const a = makeRecord({
      id: 5,
      recordText: '',
      hasPhoto: true,
      imageUrl: 'https://example.com/p.jpg',
      gemEmotionCode: 'joy',
      createdAt: '2026-05-19T09:00:01.000Z',
    });
    const b = makeRecord({
      id: 6,
      recordText: '',
      hasPhoto: true,
      imageUrl: 'https://example.com/p.jpg',
      gemEmotionCode: 'pride',
      createdAt: '2026-05-19T09:00:02.000Z',
    });
    const result = dedupeLogicalRecords([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].confirmedEmotionCodes).toEqual(['joy', 'pride']);
  });
});

describe('logicalKey helpers', () => {
  it('returns equal keys for RecordDto and ChatbotRecordDto siblings with the same content', () => {
    const record: RecordDto = makeRecord({
      id: 1,
      recordText: '같은 메시지',
      hasPhoto: false,
      createdAt: '2026-05-19T09:00:01.000Z',
    });
    const chatbot: ChatbotRecordDto = {
      id: 99,
      gem: '기쁨 원석',
      recordText: '같은 메시지',
      hasPhoto: false,
      imageUrl: null,
      aiGems: null,
      createdAt: '2026-05-19T09:00:05.000Z',
    };
    expect(logicalKeyForRecord(record)).toBe(logicalKeyForChatbotRecord(chatbot));
  });
});
