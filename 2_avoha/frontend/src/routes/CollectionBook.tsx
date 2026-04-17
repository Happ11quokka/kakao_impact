// === CollectionBook 화면 — 도감 ===
import { useEffect } from 'react';
import { useInventoryStore } from '../stores/inventory-store';
import { EMOTIONS } from '../data/emotions';
import { RECIPES } from '../data/recipes';
import { TIER_NAMES, type GemTier } from '../types/gem';
import GemStone from '../components/pixel/GemStone';

const TIERS: GemTier[] = [1, 2, 3, 4];

/** 카테고리별 실루엣 CSS 표현 */
const SILHOUETTE_STYLE: Record<string, React.CSSProperties> = {
  pebble:   { borderRadius: '50%' },
  crystal:  { borderRadius: '12% 40% 12% 40%' },
  fragment: { borderRadius: '30% 70% 50% 20%' },
};

export default function CollectionBook() {
  const { gems, fetchInventory } = useInventoryStore();
  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  const activeGems = gems.filter(g => !g.consumedAt);

  // 감정×등급별 획득 여부
  const owned = new Set(activeGems.map(g => `${g.emotionCode}-${g.tier}`));
  const totalSlots = EMOTIONS.length * TIERS.length;
  const ownedCount = new Set(activeGems.map(g => `${g.emotionCode}-${g.tier}`)).size;
  const progress = Math.round((ownedCount / totalSlots) * 100);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ padding: '20px 16px 0', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 700 }}>도감</h1>
      </div>

      {/* 수집률 바 */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--color-ink-muted)', marginBottom: 6 }}>
          <span>수집률</span>
          <span style={{ fontWeight: 700, color: 'var(--color-coral)' }}>{progress}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-surface-dim)', overflow: 'hidden' }}>
          <div
            className="animate-progress"
            style={{
              height: '100%',
              width: `${progress}%`,
              borderRadius: 4,
              background: 'linear-gradient(90deg, var(--color-coral), var(--color-amber))',
            }}
          />
        </div>
      </div>

      <div className="no-scrollbar" style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* 감정 광물 그리드 */}
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--color-ink)' }}>
          💎 감정 광물
        </h2>

        {/* 등급 헤더 */}
        <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
          <div />
          {TIERS.map(t => (
            <div key={t} style={{ textAlign: 'center', fontSize: 9, color: 'var(--color-ink-muted)', fontWeight: 600 }}>
              {TIER_NAMES[t]}
            </div>
          ))}
        </div>

        {/* 감정별 행 */}
        {EMOTIONS.map((emotion, ei) => (
          <div
            key={emotion.code}
            className="animate-fade-slide-up"
            style={{
              display: 'grid',
              gridTemplateColumns: '80px repeat(4, 1fr)',
              gap: 6,
              marginBottom: 6,
              animationDelay: `${ei * 40}ms`,
            }}
          >
            {/* 감정 라벨 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
              color: 'var(--color-ink)', fontWeight: 500,
            }}>
              <div style={{
                width: 8, height: 8,
                backgroundColor: emotion.hexColor,
                borderRadius: emotion.silhouette === 'pebble' ? '50%' : emotion.silhouette === 'crystal' ? '2px' : '30%',
              }} />
              {emotion.nameKo}
            </div>

            {/* 등급별 셀 */}
            {TIERS.map(tier => {
              const key = `${emotion.code}-${tier}`;
              const isOwned = owned.has(key);
              const gem = isOwned ? activeGems.find(g => g.emotionCode === emotion.code && g.tier === tier) : null;

              return (
                <div
                  key={tier}
                  style={{
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--radius-sm)',
                    background: isOwned ? 'var(--color-parchment)' : 'var(--color-surface-dim)',
                    border: isOwned ? `1px solid ${emotion.hexColor}40` : '1px solid transparent',
                  }}
                >
                  {isOwned && gem ? (
                    <GemStone gem={gem} size={24} />
                  ) : (
                    /* 미획득 실루엣 */
                    <div style={{
                      width: 20, height: 20,
                      backgroundColor: '#D0D0D0',
                      opacity: 0.4,
                      ...SILHOUETTE_STYLE[emotion.silhouette],
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* 특수 레시피 카드 */}
        <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 24, marginBottom: 12, color: 'var(--color-ink)' }}>
          🃏 특수 레시피
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {RECIPES.map((recipe, i) => (
            <div
              key={recipe.slug}
              className="animate-scale-pop"
              style={{
                animationDelay: `${i * 60}ms`,
                padding: 12,
                borderRadius: 'var(--radius-md)',
                background: recipe.unlocked ? 'var(--color-parchment)' : 'var(--color-surface-dim)',
                border: recipe.unlocked ? '1px solid var(--color-amber)' : '1px solid transparent',
                textAlign: 'center',
                opacity: recipe.unlocked ? 1 : 0.5,
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>
                {recipe.unlocked ? '💎' : '❓'}
              </div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink)' }}>
                {recipe.unlocked ? recipe.nameKo : '???'}
              </p>
              <p style={{ fontSize: 9, color: 'var(--color-ink-muted)', marginTop: 4 }}>
                Lv.{recipe.resultTier}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
