// === Home 화면 — 모던 UI 버전 ===
import { useEffect, useState, useMemo } from 'react';
import { useFieldStore } from '../stores/field-store';
import { useInventoryStore } from '../stores/inventory-store';
import { emotionToCategory } from '../lib/emotion-category';
import { getEmotion } from '../data/emotions';
import CollectionBook from './CollectionBook';

// 피그마 기준 5대 감정 카테고리
const EMOTION_CATEGORIES = [
  { code: 'sadness', label: '슬픔', theme: 'sadness' },
  { code: 'anxiety', label: '불안', theme: 'anxiety' },
  { code: 'anger', label: '분노', theme: 'anger' },
  { code: 'joy', label: '기쁨', theme: 'joy' },
  { code: 'complex', label: '복잡', theme: 'complex' },
];

export default function Home() {
  const { todayDrops, fetchToday, error: fieldError } = useFieldStore();
  const { ticketsRemaining, gems, fetchInventory } = useInventoryStore();
  const [showBook, setShowBook] = useState(false);
  const [mascotError, setMascotError] = useState(false);

  useEffect(() => {
    fetchToday();
    fetchInventory();
  }, [fetchToday, fetchInventory]);

  // 오늘 수집한 보석 (BE 기준 consumed_at 미설정만)
  // NOTE: 마스코트 클릭 = 먹이기 흐름은 의도치 않은 보석 삭제 UX 때문에 비활성화.
  //       다마고치 EXP 부여는 추후 명시적 인터랙션 또는 BE 동기화로 재구성 예정.
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

  // 카테고리별 개수 집계 (피그마처럼 화면에 렌더링용)
  const gemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    todayGems.forEach((gem) => {
      const cat = emotionToCategory(gem.emotionCode);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
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
            {todayDrops.map((drop) => {
              const emotion = getEmotion(drop.gem.emotionCode);
              const color = emotion?.hexColor ?? '#888';
              return (
                <div
                  key={drop.gem.id}
                  title={emotion?.nameKo ?? drop.gem.emotionCode}
                  style={{
                    position: 'absolute',
                    left: `${drop.position.x}%`,
                    top: `${drop.position.y}%`,
                    width: 22,
                    height: 28,
                    borderRadius: 7,
                    background: color,
                    transform: 'translate(-50%, -50%)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08), inset 0 -2px 0 rgba(0,0,0,0.06)',
                  }}
                />
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
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div>
              {mascotError ? (
                <div
                  style={{
                    width: 150,
                    height: 150,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#EEE',
                    borderRadius: '50%',
                    fontSize: 12,
                    color: '#999',
                    textAlign: 'center',
                    lineHeight: 1.4,
                  }}
                >
                  /images/mascot.png<br />이미지를 넣어주세요
                </div>
              ) : (
                <img
                  src="/images/mascot.png"
                  alt="마스코트"
                  style={{ width: 150, height: 'auto', objectFit: 'contain', mixBlendMode: 'multiply' }}
                  onError={() => setMascotError(true)}
                />
              )}
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
            return (
              <div
                key={cat.code}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '12px 0',
                  borderRadius: 15,
                  background: 'white',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                }}
              >
                {/* 상단 컬러 네모 */}
                <div
                  style={{
                    width: 34,
                    height: 44,
                    borderRadius: 10,
                    background: `var(--color-gem-${cat.theme}-main)`,
                    marginBottom: 8,
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 2, letterSpacing: '-0.5px' }}>
                  {cat.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-sub)' }}>
                  x{count}
                </span>
              </div>
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
      `}</style>
    </div>
  );
}
