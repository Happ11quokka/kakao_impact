// === Records Store — chatbot records with web confirmation state ===
import { create } from 'zustand';
import { api, ApiError, type RecordDto } from '../lib/api';
import { useInventoryStore } from './inventory-store';

interface RecordsState {
  records: RecordDto[];
  loading: boolean;
  error: string | null;
  savingId: number | null;
  fetchRecords: () => Promise<void>;
  confirmEmotion: (
    recordId: number,
    emotionCodes: string[],
    opts?: {
      interaction?: 'confirm' | 'reclassify';
      reflectionType?: 'question' | 'meditation' | 'none';
      reflectionAnswer?: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
  createSelfReflection: (
    questionText: string,
    answerText: string,
    linkedDate?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

const ERROR_LABEL: Record<string, string> = {
  RECORD_NOT_FOUND: '기록을 찾을 수 없어요',
  UNAUTHENTICATED: '다시 로그인해주세요',
  USER_NOT_LINKED: '카카오 계정 연동이 필요해요',
  INVALID_DATE: '날짜 형식이 올바르지 않아요',
};

export const useRecordsStore = create<RecordsState>((set, get) => ({
  records: [],
  loading: false,
  error: null,
  savingId: null,

  fetchRecords: async () => {
    set({ loading: true, error: null });
    try {
      const { records } = await api.records({ limit: 200 });
      set({ records, loading: false });
    } catch (err) {
      const message =
        err instanceof ApiError ? `${err.status} ${err.code}` : '기록을 불러오지 못했어요';
      set({ loading: false, error: message });
    }
  },

  confirmEmotion: async (recordId, emotionCodes, opts) => {
    const prev = get().records;
    const now = new Date().toISOString();
    const target = prev.find((r) => r.id === recordId);
    const interaction = opts?.interaction ?? 'confirm';
    const codes = emotionCodes.length > 0 ? emotionCodes : [];
    if (codes.length === 0) {
      return { ok: false, error: '감정을 1개 이상 선택해주세요' };
    }
    const primary = codes[0];

    set({
      savingId: recordId,
      records: prev.map((r) =>
        r.id === recordId
          ? {
              ...r,
              classificationStatus:
                interaction === 'reclassify' ? 'reclassified' : 'user_confirmed',
              confirmedEmotionCode: primary,
              confirmedEmotionCodes: codes,
              confirmedAt: now,
              webReviewedAt: now,
              updatedAt: now,
            }
          : r,
      ),
    });

    try {
      const res = await api.confirmRecordEmotion(recordId, {
        emotionCode: primary,
        emotionCodes: codes,
        interaction,
        reflectionType: opts?.reflectionType ?? 'none',
        reflectionAnswer: opts?.reflectionAnswer,
      });
      set((s) => ({
        savingId: null,
        records: s.records.map((r) =>
          r.id === recordId
            ? {
                ...r,
                classificationStatus: res.record.classificationStatus,
                confirmedEmotionCode: res.record.confirmedEmotionCode,
                confirmedEmotionCodes:
                  res.record.confirmedEmotionCodes && res.record.confirmedEmotionCodes.length > 0
                    ? res.record.confirmedEmotionCodes
                    : codes,
                confirmedAt: res.record.confirmedAt,
                webReviewedAt: res.record.webReviewedAt,
                updatedAt: res.record.updatedAt,
                questionText: res.record.questionText ?? null,
                answerText: res.record.answerText ?? null,
                gemId: res.gem.id,
                gemEmotionCode: res.gem.emotionCode,
              }
            : r,
        ),
      }));
      void useInventoryStore.getState().fetchInventory();
      return { ok: true };
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN';
      set({ savingId: null, records: prev });
      return {
        ok: false,
        error:
          ERROR_LABEL[code] ??
          (target ? `감정 저장에 실패했어요 (${code})` : '기록을 찾을 수 없어요'),
      };
    }
  },

  createSelfReflection: async (questionText, answerText, linkedDate) => {
    const question = questionText.trim();
    const answer = answerText.trim();
    if (!question || !answer) {
      return { ok: false, error: '답변을 적어주세요' };
    }
    try {
      const res = await api.createSelfReflection({
        questionText: question,
        answerText: answer,
        linkedDate,
      });
      set((s) => ({ records: [res.record, ...s.records] }));
      return { ok: true };
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN';
      return {
        ok: false,
        error: ERROR_LABEL[code] ?? `자기회고 저장에 실패했어요 (${code})`,
      };
    }
  },
}));
