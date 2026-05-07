// === Pet Store — 다마고치 상태 (프론트 전용, BE 연동 대비) ===
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 성장 단계 — 에셋 추가 시 여기에 단계만 추가하면 됨.
 * 'egg'는 부화 애니메이션용 슬롯(Tamagotchi.tsx에서 렌더러 정의), 현재 stageForLevel 분기 없음.
 */
export type PetStage = 'egg' | 'baby' | 'child' | 'adult';

// 'egg'는 level 기반 도달 단계가 아니므로 threshold에서 제외 (별도 트리거로만 진입).
const STAGE_THRESHOLDS: Record<Exclude<PetStage, 'egg'>, number> = {
  baby: 0,   // 기본 시작 단계
  child: 5,  // level 5부터
  adult: 10, // level 10부터
};

function stageForLevel(level: number): PetStage {
  if (level >= STAGE_THRESHOLDS.adult) return 'adult';
  if (level >= STAGE_THRESHOLDS.child) return 'child';
  return 'baby';
}

interface PetState {
  level: number;
  exp: number;
  expToNext: number;
  stage: PetStage;
  totalFed: number;
  lastFedAt: string | null;

  /** 원석 먹이기 (프론트 로컬) — 나중에 BE API로 교체 가능 */
  feedGem: (emotionCode: string) => { leveledUp: boolean };

  /** 백엔드 동기화용 (BE 준비되면 fetchMe 등에서 호출) */
  syncFromServer: (data: { level: number; exp: number; totalFed: number }) => void;
}

const EXP_PER_GEM = 10;
const EXP_PER_LEVEL = 50;

export const usePetStore = create<PetState>()(
  persist(
    (set, get) => ({
      level: 1,
      exp: 0,
      expToNext: EXP_PER_LEVEL,
      stage: 'baby',
      totalFed: 0,
      lastFedAt: null,

      feedGem: (_emotionCode: string) => {
        const { exp, level, totalFed } = get();
        const newExp = exp + EXP_PER_GEM;
        let leveledUp = false;

        if (newExp >= EXP_PER_LEVEL) {
          const newLevel = level + 1;
          set({
            level: newLevel,
            exp: newExp - EXP_PER_LEVEL,
            stage: stageForLevel(newLevel),
            totalFed: totalFed + 1,
            lastFedAt: new Date().toISOString(),
          });
          leveledUp = true;
        } else {
          set({
            exp: newExp,
            totalFed: totalFed + 1,
            lastFedAt: new Date().toISOString(),
          });
        }
        return { leveledUp };
      },

      syncFromServer: (data) => {
        set({
          level: data.level,
          exp: data.exp,
          // 현재는 레벨별 고정 EXP_PER_LEVEL. 서버 contract가 동적이 되면 data에서 받아 반영.
          expToNext: EXP_PER_LEVEL,
          stage: stageForLevel(data.level),
          totalFed: data.totalFed,
        });
      },
    }),
    {
      name: 'avoha-pet',
      storage: createJSONStorage(() => localStorage),
      // 메서드는 직렬화 불가 → state 필드만 저장
      partialize: (state) => ({
        level: state.level,
        exp: state.exp,
        expToNext: state.expToNext,
        stage: state.stage,
        totalFed: state.totalFed,
        lastFedAt: state.lastFedAt,
      }),
      version: 1,
      // hydration race 가드가 필요한 UI(예: 펫 스탯 카드)는
      // `usePetStore.persist.hasHydrated()` 또는 onRehydrateStorage 사용.
    }
  )
);
