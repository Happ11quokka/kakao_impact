// === Workshop 화면 — RPG 강화 패널 느낌 ===
import { useEffect, useState } from 'react';
import { useCraftingStore } from '../stores/crafting-store';
import { useInventoryStore } from '../stores/inventory-store';
import GemStone from '../components/pixel/GemStone';
import { getEmotion } from '../data/emotions';
import { TIER_NAMES, type Gem, type GemTier } from '../types/gem';
import { findRecipe } from '../data/recipes';

export default function Workshop() {
  const { slot1, slot2, setSlot, combine, clearSlots, lastResult, clearResult, crafting } =
    useCraftingStore();
  const { gems, fetchInventory } = useInventoryStore();
  const [showPicker, setShowPicker] = useState<1 | 2 | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [craftingPhase, setCraftingPhase] = useState<'idle' | 'charging' | 'flash' | 'done'>('idle');

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  const availableGems = gems.filter(
    (g) => !g.consumedAt && g.id !== slot1?.id && g.id !== slot2?.id,
  );

  const canCraft = !!slot1 && !!slot2;
  const isSameType = slot1 && slot2 && slot1.emotionCode === slot2.emotionCode && slot1.tier === slot2.tier;
  const recipe = slot1 && slot2 ? findRecipe(slot1.emotionCode, slot2.emotionCode) : undefined;
  const craftable = !!isSameType || !!recipe;

  const handleCraft = async () => {
    if (!canCraft || crafting) return;
    setCraftingPhase('charging');

    const animationPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        setCraftingPhase('flash');
        setShowFlash(true);
        setTimeout(resolve, 500);
      }, 800);
    });
    const apiPromise = combine();

    const [, result] = await Promise.all([animationPromise, apiPromise]);
    setShowFlash(false);
    setCraftingPhase('done');

    if (result.success && result.resultGem) {
      if (navigator.vibrate) navigator.vibrate(80);
      setShowResult(true);
    } else if (result.error) {
      setErrorToast(result.error);
      setTimeout(() => setErrorToast(null), 2500);
    }
    setTimeout(() => setCraftingPhase('idle'), 300);
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #1B1C26 0%, #252838 50%, #1B1C26 100%)',
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="animate-glow"
            style={{
              position: 'absolute',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: 1.5 + Math.random() * 2,
              height: 1.5 + Math.random() * 2,
              borderRadius: '50%',
              background: 'rgba(200, 200, 255, 0.3)',
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {showFlash && (
        <div
          className="animate-craft-flash"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            background:
              'radial-gradient(circle, rgba(255,215,0,0.8) 0%, rgba(232,97,77,0.4) 40%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
      )}

      {errorToast && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            padding: '10px 18px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(200, 80, 80, 0.9)',
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {errorToast}
        </div>
      )}

      <div style={{ padding: '16px 16px 0', textAlign: 'center', zIndex: 2 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 700, color: '#E8D8C8' }}>
          ⚒️ 세공소
        </h1>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 2,
          margin: '12px 14px',
          borderRadius: 'var(--radius-lg)',
          background: 'linear-gradient(180deg, rgba(60,65,90,0.6) 0%, rgba(40,44,65,0.8) 100%)',
          border: '1px solid rgba(120,130,180,0.25)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.4)',
          padding: '20px 16px',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <SlotCard gem={slot1} label="재료 1" onClick={() => setShowPicker(1)} />
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(232,168,56,0.2)',
              border: '1px solid rgba(232,168,56,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#E8A838',
              fontSize: 18,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            +
          </div>
          <SlotCard gem={slot2} label="재료 2" onClick={() => setShowPicker(2)} />
        </div>

        {canCraft && (
          <div className="animate-fade-slide-up" style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 20 }}>▼</div>
          </div>
        )}

        {canCraft && (
          <div
            className="animate-scale-pop"
            style={{
              margin: '0 auto 20px',
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              background: craftable
                ? 'linear-gradient(135deg, rgba(60,80,60,0.6) 0%, rgba(40,60,40,0.8) 100%)'
                : 'linear-gradient(135deg, rgba(80,40,40,0.6) 0%, rgba(60,30,30,0.8) 100%)',
              border: craftable ? '1px solid rgba(100,200,100,0.3)' : '1px solid rgba(200,80,80,0.3)',
              textAlign: 'center',
              minWidth: 180,
            }}
          >
            {craftable ? (
              <>
                <div style={{ fontSize: 11, color: 'rgba(150,255,150,0.7)', marginBottom: 8 }}>
                  결과 미리보기
                </div>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    margin: '0 auto 8px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 20px rgba(255,215,0,0.15)',
                  }}
                >
                  {isSameType && slot1 ? (
                    <GemStone
                      gem={{ ...slot1, tier: Math.min(4, slot1.tier + 1) as GemTier, id: 'preview' }}
                      size={32}
                    />
                  ) : recipe ? (
                    <span style={{ fontSize: 28 }}>✨</span>
                  ) : null}
                </div>
                <div style={{ color: '#E8D8C8', fontSize: 14, fontWeight: 700 }}>
                  {isSameType && slot1
                    ? `${getEmotion(slot1.emotionCode)?.gemName} → ${TIER_NAMES[Math.min(4, slot1.tier + 1) as GemTier]}`
                    : recipe?.nameKo}
                </div>
                <div style={{ color: 'rgba(150,255,150,0.8)', fontSize: 12, marginTop: 6, fontWeight: 600 }}>
                  성공 확률: 100%
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🚫</div>
                <div style={{ color: '#FF8888', fontSize: 13, fontWeight: 600 }}>
                  이 조합으로는 세공할 수 없어요
                </div>
              </>
            )}
          </div>
        )}

        <button
          onClick={handleCraft}
          disabled={!canCraft || !craftable || craftingPhase !== 'idle'}
          style={{
            display: 'block',
            margin: '0 auto',
            padding: '14px 48px',
            borderRadius: 'var(--radius-full)',
            border: canCraft && craftable ? '2px solid rgba(232,97,77,0.5)' : '2px solid rgba(100,100,120,0.3)',
            background:
              canCraft && craftable
                ? 'linear-gradient(135deg, #E8614D 0%, #D45440 100%)'
                : 'rgba(60,60,80,0.5)',
            color: canCraft && craftable ? 'white' : 'rgba(150,150,170,0.5)',
            fontWeight: 700,
            fontSize: 16,
            cursor: canCraft && craftable ? 'pointer' : 'not-allowed',
            boxShadow:
              canCraft && craftable
                ? '0 4px 20px rgba(232,97,77,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                : 'none',
            transition: 'all var(--duration-normal) var(--easing-out)',
            animation: canCraft && craftable ? 'pulseGlow 2.5s ease-in-out infinite' : 'none',
          }}
        >
          {craftingPhase === 'charging' ? '⚡ 세공 중...' :
           craftingPhase === 'flash' ? '✨' :
           '🔨 세공 시작'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16 }}>
          {(slot1 || slot2) && (
            <button
              onClick={() => {
                clearSlots();
                clearResult();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(200,200,220,0.5)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              🔄 슬롯 비우기
            </button>
          )}
        </div>
      </div>

      {showPicker !== null && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30 }}>
          <div
            onClick={() => setShowPicker(null)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
          />
          <div
            className="animate-slide-up"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: '#252838',
              borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
              padding: '20px 16px',
              maxHeight: '55%',
              overflow: 'auto',
              border: '1px solid rgba(120,130,180,0.2)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 4,
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 2,
                margin: '0 auto 16px',
              }}
            />
            <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: '#E8D8C8' }}>
              재료 선택 (슬롯 {showPicker})
            </p>
            {availableGems.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'rgba(200,200,220,0.5)', padding: 20 }}>
                사용 가능한 보석이 없어요
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {availableGems.map((gem) => {
                  const emotion = getEmotion(gem.emotionCode);
                  return (
                    <div
                      key={gem.id}
                      onClick={() => {
                        setSlot(showPicker, gem);
                        setShowPicker(null);
                        clearResult();
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 5,
                        padding: 10,
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(60,65,90,0.6)',
                        cursor: 'pointer',
                        border: `1px solid ${emotion?.hexColor}30`,
                        transition: 'all var(--duration-fast) var(--easing-out)',
                      }}
                    >
                      <GemStone gem={gem} size={30} />
                      <span style={{ fontSize: 10, color: 'rgba(200,200,220,0.7)' }}>
                        {emotion?.nameKo}
                      </span>
                      <span style={{ fontSize: 8, color: 'rgba(200,200,220,0.4)' }}>
                        Lv.{gem.tier}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showResult && lastResult?.success && lastResult.resultGem && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={() => {
              setShowResult(false);
              clearResult();
            }}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }}
          />
          <div
            style={{
              position: 'absolute',
              width: 300,
              height: 300,
              background: 'radial-gradient(circle, rgba(255,215,0,0.15) 0%, transparent 70%)',
              borderRadius: '50%',
              animation: 'pulseGlow 2s ease-in-out infinite',
            }}
          />
          <div
            className="animate-scale-pop"
            style={{
              position: 'relative',
              background: 'linear-gradient(135deg, #2A2D3A 0%, #1B1C26 100%)',
              borderRadius: 'var(--radius-xl)',
              padding: '36px 28px',
              textAlign: 'center',
              border: '1px solid rgba(255,215,0,0.3)',
              boxShadow: '0 0 60px rgba(255,215,0,0.1), 0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: 13, color: '#FFD700', fontWeight: 700, marginBottom: 20, letterSpacing: 2 }}>
              ✨ 세공 성공!
            </div>
            <div
              style={{
                width: 80,
                height: 80,
                margin: '0 auto 16px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,215,0,0.1) 0%, transparent 70%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 0 30px ${getEmotion(lastResult.resultGem.emotionCode)?.hexColor}40`,
              }}
            >
              <GemStone
                gem={{
                  id: lastResult.resultGem.id,
                  emotionCode: lastResult.resultGem.emotionCode,
                  tier: lastResult.resultGem.tier,
                  craftedFrom: lastResult.resultGem.craftedFrom,
                  createdAt: lastResult.resultGem.createdAt,
                  consumedAt: null,
                }}
                size={56}
              />
            </div>
            <p style={{ fontWeight: 700, fontSize: 18, color: '#E8D8C8' }}>
              {getEmotion(lastResult.resultGem.emotionCode)?.gemName}
            </p>
            <p style={{ color: 'rgba(200,200,220,0.6)', fontSize: 13, marginTop: 4 }}>
              {TIER_NAMES[lastResult.resultGem.tier as GemTier]}
            </p>
            {lastResult.recipeSlug && (
              <div
                style={{
                  margin: '12px auto 0',
                  padding: '6px 16px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(232,168,56,0.15)',
                  border: '1px solid rgba(232,168,56,0.3)',
                  color: '#E8A838',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'inline-block',
                }}
              >
                🃏 {lastResult.recipeSlug}
              </div>
            )}
            <button
              onClick={() => {
                setShowResult(false);
                clearResult();
              }}
              style={{
                display: 'block',
                margin: '24px auto 0',
                padding: '10px 36px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid rgba(255,215,0,0.3)',
                background: 'rgba(60,65,90,0.6)',
                color: '#E8D8C8',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotCard({ gem, label, onClick }: { gem: Gem | null; label: string; onClick: () => void }) {
  const emotion = gem ? getEmotion(gem.emotionCode) : null;

  return (
    <button
      onClick={onClick}
      style={{
        width: 120,
        minHeight: 140,
        borderRadius: 'var(--radius-md)',
        border: gem ? `2px solid ${emotion?.hexColor}60` : '2px dashed rgba(120,130,180,0.25)',
        background: gem
          ? `linear-gradient(180deg, ${emotion?.hexColor}15 0%, rgba(40,44,65,0.8) 100%)`
          : 'rgba(40,44,65,0.4)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 12,
        cursor: 'pointer',
        boxShadow: gem ? `0 0 16px ${emotion?.hexColor}20, inset 0 1px 0 rgba(255,255,255,0.05)` : 'none',
        transition: 'all var(--duration-normal) var(--easing-out)',
      }}
    >
      {gem ? (
        <>
          <GemStone gem={gem} size={40} />
          <span style={{ color: '#E8D8C8', fontSize: 13, fontWeight: 700 }}>{emotion?.gemName}</span>
          <span style={{ color: 'rgba(200,200,220,0.6)', fontSize: 11 }}>{emotion?.nameKo}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: gem.tier >= 3 ? '#FFD700' : 'rgba(200,200,220,0.5)',
            }}
          >
            Lv.{gem.tier} {TIER_NAMES[gem.tier as GemTier]}
          </span>
        </>
      ) : (
        <>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '2px dashed rgba(120,130,180,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 20, opacity: 0.3, color: 'rgba(200,200,220,0.5)' }}>+</span>
          </div>
          <span style={{ color: 'rgba(200,200,220,0.4)', fontSize: 11 }}>{label}</span>
          <span style={{ color: 'rgba(200,200,220,0.25)', fontSize: 9 }}>탭하여 선택</span>
        </>
      )}
    </button>
  );
}
