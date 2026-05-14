// === Home 화면 — 모던 UI 버전 ===
import { useEffect, useState, useMemo } from 'react';
import { useFieldStore } from '../stores/field-store';
import { useInventoryStore } from '../stores/inventory-store';
import { usePetStore } from '../stores/pet-store';
import { emotionToCategory } from '../lib/emotion-category';
import { getEmotion } from '../data/emotions';
import CollectionBook from './CollectionBook';
import ChibiAvatar from '../components/field/ChibiAvatar';
import GemStone from '../components/pixel/GemStone';
import type { Gem } from '../types/gem';

// 피그마 기준 5대 감정 카테고리
const EMOTION_CATEGORIES = [
  { code: 'sadness', label: '슬픔', theme: 'sadness' },
  { code: 'anxiety', label: '불안', theme: 'anxiety' },
  { code: 'anger', label: '분노', theme: 'anger' },
  { code: 'joy', label: '기쁨', theme: 'joy' },
  { code: 'complex', label: '복잡', theme: 'complex' },
];

const CATEGORY_REPRESENTATIVE_EMOTION: Record<string, string> = {
  sadness: 'sadness',
  anxiety: 'solace',
  anger: 'annoyance',
  joy: 'satisfaction',
  complex: 'regret',
};

const CATEGORY_REPRESENTATIVE_VARIANT: Record<string, string> = {
  sadness: '우울',
  anxiety: '걱정',
  anger: '화남',
  joy: '즐거움',
  complex: '공허',
};

export default function Home() {
  const { todayDrops, fetchToday, error: fieldError } = useFieldStore();
  const { ticketsRemaining, gems, fetchInventory, consumeGem } = useInventoryStore();
  const feedGem = usePetStore((s) => s.feedGem);
  const [showBook, setShowBook] = useState(false);
  const [mascotMood, setMascotMood] = useState<'idle' | 'eating'>('idle');

  // 먹이기 애니메이션 트리거. 카드를 탭할 때마다 +1 → 마스코트 wrapper 리마운트로 munch 재생.
  const [eatNonce, setEatNonce] = useState(0);
  // 어떤 카테고리 카드가 방금 탭됐는지 (cardPop 애니 + 키 리셋용 nonce 포함).
  const [poppedCard, setPoppedCard] = useState<{ code: string; nonce: number } | null>(null);

  useEffect(() => {
    fetchToday();
    fetchInventory();
  }, [fetchToday, fetchInventory]);

  // 카드 팝 애니 끝나면 상태 클리어 → 다음 탭에서 다시 트리거 가능.
  useEffect(() => {
    if (!poppedCard) return;
    const t = setTimeout(() => setPoppedCard(null), 500);
    return () => clearTimeout(t);
  }, [poppedCard]);

  // 카테고리 카드 탭 = 해당 카테고리에서 가장 오래된 미소비 보석을 1개 먹임.
  // 마스코트 직접 탭이 아닌 카드 탭만 허용해서 의도치 않은 보석 소비 방지(이전 커밋 정책 유지).
  const handleFeed = (categoryCode: string) => {
    // 클로저 stale 방지: 가장 최신 store 상태에서 후보 선정 → 빠른 연타도 정확히 1개씩 소비.
    const allGems = useInventoryStore.getState().gems;
    const now = new Date();
    const target = allGems
      .filter((g) => !g.consumedAt)
      .filter((g) => {
        const d = new Date(g.createdAt);
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      })
      .filter((g) => emotionToCategory(g.emotionCode) === categoryCode)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    if (!target) return;

    consumeGem(target.id);
    feedGem(target.emotionCode);
    setEatNonce((n) => n + 1);
    setMascotMood('eating');
    setPoppedCard({ code: categoryCode, nonce: Date.now() });
  };

  useEffect(() => {
    if (mascotMood !== 'eating') return;
    const t = window.setTimeout(() => setMascotMood('idle'), 520);
    return () => window.clearTimeout(t);
  }, [mascotMood]);

  // 오늘 수집한 보석 (BE 기준 consumed_at 미설정만)
  // NOTE: 마스코트 직접 탭이 아닌 "오늘 채집할 원석" 카드 탭으로 먹이기 트리거.
  //       소비는 현재 프론트 로컬(`consumeGem`)만 수행. BE 동기화는 추후.
  const todayGems = useMemo(() => {
    return gems.filter((g) => {
      if (g.consumedAt) return false;
      const d = new Date(g.createdAt);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    });
  }, [gems]);

  // 마스코트 주위 필드에 떠있는 원석 중, 로컬에서 소비된 건 즉시 숨김.
  // field-store는 consumedAt를 추적 안 함 → inventory의 consumedAt와 cross-ref.
  const consumedGemIds = useMemo(
    () => new Set(gems.filter((g) => g.consumedAt).map((g) => g.id)),
    [gems],
  );
  const visibleDrops = useMemo(
    () => todayDrops.filter((d) => !consumedGemIds.has(d.gem.id)),
    [todayDrops, consumedGemIds],
  );

  // 카테고리별 개수 집계 (피그마처럼 화면에 렌더링용)
  const gemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    todayGems.forEach((gem) => {
      const cat = emotionToCategory(gem.emotionCode);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [todayGems]);

  const cardGemByCategory = useMemo<Record<string, Gem>>(() => {
    const nowIso = new Date().toISOString();
    const grouped: Record<string, Gem | undefined> = {};
    todayGems.forEach((gem) => {
      const cat = emotionToCategory(gem.emotionCode);
      if (!grouped[cat]) grouped[cat] = gem;
    });

    const result: Record<string, Gem> = {};
    EMOTION_CATEGORIES.forEach((cat, idx) => {
      result[cat.code] =
        grouped[cat.code] ??
        ({
          id: `card-${cat.code}-${idx}`,
          emotionCode: CATEGORY_REPRESENTATIVE_EMOTION[cat.code] ?? 'untroubled',
          tier: 2,
          createdAt: nowIso,
          consumedAt: null,
        } as Gem);
    });
    return result;
  }, [todayGems]);

  const todayDateString = useMemo(() => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = days[now.getDay()];
    return `${month}월 ${date}일 ${dayName}요일`;
  }, []);

  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        background: 'var(--color-base)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 20px',
        paddingTop: 'calc(24px + env(safe-area-inset-top))',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* ── 상단 헤더: 채집권 & 도감 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div
          style={{
            background: 'var(--color-point-green)',
            borderRadius: 999,
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFF' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#FFF' }}>
            채집권 {ticketsRemaining}/5
          </span>
        </div>
        
        <button
          onClick={() => setShowBook(true)}
          style={{
            background: 'var(--color-point-yellow)',
            borderRadius: 14,
            padding: '8px 18px',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--color-text-main)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          도감
        </button>
      </div>

      {/* ── 상단 영역 (날짜 + 펫) 배경 원 포함 ── */}
      {!showBook ? (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 287, justifyContent: 'center', marginBottom: 20 }}>
          {/* 마스코트 배경 원 (Figma Ellipse 21) */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 287,
              height: 287,
              borderRadius: '50%',
              background: '#F0E7D3',
              zIndex: 0,
            }}
          />

          {/* 보석 layer — 배경 원과 동일한 287x287 영역에 한정. 백엔드 좌표(0..100%)는 이 영역 기준 */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 287,
              height: 287,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {visibleDrops.map((drop) => {
              const emotion = getEmotion(drop.gem.emotionCode);
              return (
                <div
                  key={drop.gem.id}
                  title={emotion?.nameKo ?? drop.gem.emotionCode}
                  style={{
                    position: 'absolute',
                    left: `${drop.position.x}%`,
                    top: `${drop.position.y}%`,
                    transform: 'translate(-50%, -50%)',
                    animation: 'gemDropIn 0.4s ease-out',
                  }}
                >
                  <GemStone gem={drop.gem} size={40} />
                </div>
              );
            })}
            
          </div>

          {fieldError && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 11,
                color: 'var(--color-text-sub)',
                background: 'rgba(255,255,255,0.7)',
                padding: '2px 8px',
                borderRadius: 999,
                zIndex: 3,
              }}
            >
              오늘의 원석을 못 불러왔어요
            </div>
          )}

          {/* ── 날짜 ── */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <div
              style={{
                background: 'var(--color-point-yellow)',
                borderRadius: 14,
                padding: '8px 24px',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-sub)' }}>
                {todayDateString}
              </span>
            </div>
          </div>

          {/* ── 펫 영역 (마스코트) ── */}
          {/* 두 단계 wrapper:
              - outer: 항상 mascotBreathe 무한 반복 (살짝의 미세 호흡감)
              - inner: 먹일 때 mascotMunch 1회 재생. eatNonce가 바뀌면 리마운트되며 애니가 다시 처음부터 재생됨. */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              animation: 'mascotBreathe 3.6s ease-in-out infinite',
            }}
          >
            <div
              key={`mascot-${eatNonce}`}
              style={{
                position: 'relative',
                animation: eatNonce > 0 ? 'mascotMunch 0.6s ease' : undefined,
                transformOrigin: '50% 80%',
                filter: 'saturate(0.86) contrast(0.95)',
              }}
            >
              <ChibiAvatar size={150} mood={mascotMood} />

            </div>
          </div>
        </div>
      ) : (
        // Figma의 `메인화면_도감`처럼: 홈 레이아웃 안에서, 마스코트/원석 자리(y≈184)에 패널이 올라오는 형태
        <div
          style={{
            position: 'relative',
            marginTop: 104,
            marginBottom: 20,
            marginLeft: -20,
            marginRight: -20,
            display: 'flex',
            justifyContent: 'center',
            width: 'calc(100% + 40px)',
          }}
        >
          <div
            style={{
              width: 'calc(100% - 12px)',
              maxWidth: 391,
              aspectRatio: '391 / 540',
              overflow: 'hidden',
              animation: 'slideDown 0.2s ease-out',
            }}
          >
            <CollectionBook onClose={() => setShowBook(false)} />
          </div>
        </div>
      )}

      {/* ── 오늘 채집할 원석 ── */}
      {!showBook && (
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-main)', marginBottom: todayGems.length === 0 ? 6 : 16 }}>
          오늘 채집할 원석
        </h3>
        {todayGems.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--color-text-sub)', margin: '0 0 16px' }}>
            아직 오늘 채집한 원석이 없어요. 카카오톡 챗봇에게 마음을 보내보세요.
          </p>
        )}

        {/* 수평 카드 리스트 (스크롤 없이 꽉 차게) */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            width: '100%',
            paddingBottom: 20,
          }}
        >
          {EMOTION_CATEGORIES.map(cat => {
            const count = gemCounts[cat.code] || 0;
            const isPopping = poppedCard?.code === cat.code;
            const disabled = count === 0;
            return (
              <button
                type="button"
                // poppedCard.nonce가 바뀌면 key가 바뀌어 리마운트 → cardPop이 매 탭마다 처음부터 재생.
                key={isPopping ? `${cat.code}-${poppedCard.nonce}` : cat.code}
                onClick={disabled ? undefined : () => handleFeed(cat.code)}
                disabled={disabled}
                aria-label={`${cat.label} 원석 ${count}개 — 마스코트에게 먹이기`}
                style={{
                  position: 'relative',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '12px 0',
                  borderRadius: 15,
                  background: 'white',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                  border: 'none',
                  font: 'inherit',
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.45 : 1,
                  transition: 'opacity 0.2s ease, transform 0.1s ease',
                  animation: isPopping ? 'cardPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' : undefined,
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation',
                  overflow: 'visible',
                }}
              >
                {/* 상단 컬러 네모 */}
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <GemStone
                    gem={cardGemByCategory[cat.code]}
                    size={38}
                    variant={CATEGORY_REPRESENTATIVE_VARIANT[cat.code]}
                  />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 2, letterSpacing: '-0.5px' }}>
                  {cat.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-sub)' }}>
                  x{count}
                </span>

                {/* 탭 직후 카드 위에 -1 표시 살짝 띄움 */}
                {isPopping && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--color-point-green, #4CAF50)',
                      animation: 'minusFloat 0.6s ease-out forwards',
                      pointerEvents: 'none',
                    }}
                  >
                    -1
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      )}
      <style>{`
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes slideDown {
          from { transform: translateY(-8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        /* 마스코트 항상 살짝 숨쉬듯 — 미세한 상하 이동 + 스케일 */
        @keyframes mascotBreathe {
          0%, 100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-3px) scale(1.015); }
        }
        /* 카드 탭 시 마스코트가 한 번 통통 튀며 먹는 모션 */
        @keyframes mascotMunch {
          0%   { transform: translateY(0) scaleX(1) scaleY(1) rotate(0deg); }
          18%  { transform: translateY(-10px) scaleX(0.92) scaleY(1.10) rotate(-3deg); }
          38%  { transform: translateY(4px) scaleX(1.06) scaleY(0.92) rotate(2deg); }
          60%  { transform: translateY(-4px) scaleX(0.98) scaleY(1.04) rotate(-1deg); }
          82%  { transform: translateY(1px) scaleX(1.02) scaleY(0.98) rotate(0.5deg); }
          100% { transform: translateY(0) scaleX(1) scaleY(1) rotate(0deg); }
        }
        /* 카드 탭 피드백 — 살짝 눌렸다가 통통 튀어오름 */
        @keyframes cardPop {
          0%   { transform: scale(1);    box-shadow: 0 2px 10px rgba(0,0,0,0.02); }
          25%  { transform: scale(0.93); box-shadow: 0 1px 4px  rgba(0,0,0,0.06); }
          60%  { transform: scale(1.06); box-shadow: 0 8px 20px rgba(0,0,0,0.1); }
          100% { transform: scale(1);    box-shadow: 0 2px 10px rgba(0,0,0,0.02); }
        }
        /* 마스코트 주변 반짝임 입자 */
        @keyframes sparklePop {
          0%   { transform: translateY(0) scale(0.4) rotate(0deg);   opacity: 0; }
          25%  { transform: translateY(-4px) scale(1.1) rotate(20deg); opacity: 1; }
          100% { transform: translateY(-22px) scale(0.5) rotate(80deg); opacity: 0; }
        }
        /* 카드에서 살짝 떠오르는 -1 인디케이터 */
        @keyframes minusFloat {
          0%   { transform: translateY(0) scale(0.6);  opacity: 0; }
          25%  { transform: translateY(-2px) scale(1); opacity: 1; }
          100% { transform: translateY(-22px) scale(0.95); opacity: 0; }
        }
        /* 새 원석이 마스코트 주변에 떨어질 때 사용 */
        @keyframes gemDropIn {
          0%   { transform: translate(-50%, -130%) scale(0.6); opacity: 0; }
          70%  { transform: translate(-50%, -42%)  scale(1.08); opacity: 1; }
          100% { transform: translate(-50%, -50%)  scale(1);    opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          /* 모션 줄이기 환경에선 호흡/먹기 애니 끄고 색·텍스트만 갱신 */
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}
