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
    emotionCode: string,
    opts?: { interaction?: 'confirm' | 'reclassify'; reflectionType?: 'question' | 'meditation' | 'none' },
  ) => Promise<{ ok: boolean; error?: string }>;
}

const ERROR_LABEL: Record<string, string> = {
  RECORD_NOT_FOUND: '기록을 찾을 수 없어요',
  UNAUTHENTICATED: '다시 로그인해주세요',
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

  confirmEmotion: async (recordId, emotionCode, opts) => {
    const prev = get().records;
    const now = new Date().toISOString();
    const target = prev.find((r) => r.id === recordId);
    const interaction = opts?.interaction ?? 'confirm';

    set({
      savingId: recordId,
      records: prev.map((r) =>
        r.id === recordId
          ? {
              ...r,
              classificationStatus:
                interaction === 'reclassify' ? 'reclassified' : 'user_confirmed',
              confirmedEmotionCode: emotionCode,
              confirmedAt: now,
              webReviewedAt: now,
              updatedAt: now,
            }
          : r,
      ),
    });

    try {
      const res = await api.confirmRecordEmotion(recordId, {
        emotionCode,
        interaction,
        reflectionType: opts?.reflectionType ?? 'none',
      });
      set((s) => ({
        savingId: null,
        records: s.records.map((r) =>
          r.id === recordId
            ? {
                ...r,
                classificationStatus: res.record.classificationStatus,
                confirmedEmotionCode: res.record.confirmedEmotionCode,
                confirmedAt: res.record.confirmedAt,
                webReviewedAt: res.record.webReviewedAt,
                updatedAt: res.record.updatedAt,
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
        error: ERROR_LABEL[code] ?? (target ? '감정 저장에 실패했어요' : '기록을 찾을 수 없어요'),
      };
    }
  },
}));
