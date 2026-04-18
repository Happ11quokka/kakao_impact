import { useEffect, useState } from 'react';

export type FieldPhase = 'dawn' | 'afternoon' | 'dusk';

export function getFieldTimePhase(): FieldPhase {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'dawn';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'dusk';
}

/** HomeField와 동일한 하늘 그라데이션 — 다른 탭 배경에도 사용 */
export const FIELD_SKY: Record<FieldPhase, string> = {
  dawn:
    'linear-gradient(180deg, #FF9870 0%, #FFB888 20%, #FFD4A8 45%, #FFF0D0 70%, #E8F0FF 100%)',
  afternoon:
    'linear-gradient(180deg, #4A90D9 0%, #6AABE8 30%, #87CEEB 60%, #C8E8F8 85%, #E0F4F0 100%)',
  dusk:
    'linear-gradient(180deg, #0D0D2B 0%, #1B1B3A 20%, #2D2558 40%, #3D3468 60%, #4A3F6B 75%, #3A3E5B 100%)',
};

export function useFieldTimePhase(): FieldPhase {
  const [phase, setPhase] = useState<FieldPhase>(getFieldTimePhase);
  useEffect(() => {
    const id = window.setInterval(() => setPhase(getFieldTimePhase()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return phase;
}

/** 어두운 배경(dusk)에서 헤더·본문 대비 */
export function fieldPageChrome(phase: FieldPhase) {
  const isDusk = phase === 'dusk';
  return {
    title: isDusk ? 'rgba(255, 248, 235, 0.96)' : 'var(--color-ink)',
    muted: isDusk ? 'rgba(255, 230, 200, 0.82)' : 'var(--color-ink-muted)',
    tabBg: isDusk ? 'rgba(18, 16, 36, 0.42)' : 'var(--color-surface-dim)',
    tabActiveBg: isDusk ? 'rgba(255, 250, 244, 0.94)' : 'white',
    tabInactive: isDusk ? 'rgba(255, 220, 180, 0.75)' : 'var(--color-ink-muted)',
    tabActive: isDusk ? 'var(--color-brown)' : 'var(--color-coral)',
    card: isDusk ? 'rgba(255, 250, 244, 0.94)' : 'var(--color-parchment)',
    sheet: isDusk ? 'rgba(255, 250, 244, 0.98)' : 'white',
    /** 밝은 카드 위 라벨 — `muted`는 하늘 그라데이션용이라 카드에는 쓰지 않기 */
    cardText: 'var(--color-ink)',
    cardTextMuted: 'var(--color-ink-muted)',
  };
}
