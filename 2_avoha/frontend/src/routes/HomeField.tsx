// === HomeField 화면 — 2D 횡스크롤 RPG 월드 느낌 ===
import { useEffect, useMemo } from 'react';
import { useFieldStore } from '../stores/field-store';
import { useInventoryStore } from '../stores/inventory-store';
import GemStone from '../components/pixel/GemStone';
import ChibiAvatar from '../components/field/ChibiAvatar';
import PixelTree from '../components/field/PixelTree';

function getTimePhase(): 'dawn' | 'afternoon' | 'dusk' {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'dawn';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'dusk';
}

const SKY = {
  dawn:      'linear-gradient(180deg, #FFB7A5 0%, #FFD4A8 30%, #FFF0D0 60%, #E8F0FF 100%)',
  afternoon: 'linear-gradient(180deg, #87CEEB 0%, #A8D8EA 40%, #C8E8F0 70%, #E0F0E8 100%)',
  dusk:      'linear-gradient(180deg, #1B1B3A 0%, #2D2D5E 25%, #4A3F6B 50%, #6B5A7B 75%, #3A3E5B 100%)',
};

const MOUNTAIN_COLOR = {
  dawn: ['#C8B8D8', '#D8C8E0'],
  afternoon: ['#7A9EB8', '#90B0C8'],
  dusk: ['#2A2A4A', '#3A3A5A'],
};

export default function HomeField() {
  const { todayDrops, fetchToday } = useFieldStore();
  const { ticketsRemaining, fetchInventory } = useInventoryStore();

  useEffect(() => { fetchToday(); fetchInventory(); }, [fetchToday, fetchInventory]);

  const phase = useMemo(getTimePhase, []);
  const isDusk = phase === 'dusk';
  const mtColors = MOUNTAIN_COLOR[phase];

  return (
    <div style={{
      flex: 1, position: 'relative', overflow: 'hidden',
      background: SKY[phase],
      transition: 'background 1s ease',
    }}>
      {/* HUD — 채집권 */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 20,
        background: 'rgba(27,28,38,0.55)', backdropFilter: 'blur(8px)',
        borderRadius: 'var(--radius-full)', padding: '5px 14px',
        fontSize: 13, fontWeight: 700, color: '#FFD700',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,215,0,0.3)',
      }}>
        🎫 {ticketsRemaining}/5
      </div>

      {/* 시간대 */}
      <div style={{ position: 'absolute', top: 12, right: 14, zIndex: 20, fontSize: 22 }}>
        {phase === 'dawn' ? '🌅' : phase === 'afternoon' ? '☀️' : '🌙'}
      </div>

      {/* 별 (dusk only) */}
      {isDusk && (
        <>
          {[
            { x: 15, y: 8, s: 2, d: '0s' }, { x: 30, y: 5, s: 1.5, d: '0.5s' },
            { x: 55, y: 12, s: 2, d: '1s' }, { x: 70, y: 6, s: 1, d: '1.5s' },
            { x: 85, y: 15, s: 1.5, d: '2s' }, { x: 45, y: 3, s: 1, d: '0.8s' },
            { x: 20, y: 18, s: 1, d: '1.2s' }, { x: 75, y: 20, s: 1.5, d: '0.3s' },
          ].map((star, i) => (
            <div key={i} className="animate-glow" style={{
              position: 'absolute', left: `${star.x}%`, top: `${star.y}%`,
              width: star.s, height: star.s, borderRadius: '50%',
              background: 'white', animationDelay: star.d,
            }} />
          ))}
        </>
      )}

      {/* Layer 1: 구름 */}
      <div style={{ position: 'absolute', top: '5%', width: '250%', height: '12%', opacity: isDusk ? 0.2 : 0.5 }}>
        {[0, 90, 200, 320, 450].map((x, i) => (
          <div key={i} className="animate-float" style={{
            position: 'absolute', left: x, top: i % 2 === 0 ? 0 : 12,
            width: 50 + i * 12, height: 16 + i * 3,
            background: isDusk ? 'rgba(200,200,240,0.15)' : 'rgba(255,255,255,0.8)',
            borderRadius: 'var(--radius-full)', filter: 'blur(3px)',
            animationDelay: `${i * 0.6}s`, animationDuration: `${8 + i * 2}s`,
          }} />
        ))}
      </div>

      {/* Layer 2: 먼 산 */}
      <svg viewBox="0 0 400 80" style={{ position: 'absolute', bottom: '40%', width: '100%', height: '20%', opacity: 0.6 }} preserveAspectRatio="none">
        <path d="M0 80 L40 35 L80 55 L140 15 L200 45 L260 20 L320 50 L380 30 L400 60 L400 80 Z" fill={mtColors[0]} />
        <path d="M0 80 L60 50 L120 30 L180 55 L240 25 L300 45 L360 35 L400 55 L400 80 Z" fill={mtColors[1]} opacity="0.7" />
      </svg>

      {/* Layer 3: 중경 나무들 (작은) */}
      <div style={{ position: 'absolute', bottom: '35%', width: '100%', display: 'flex', justifyContent: 'space-around', paddingLeft: 20, paddingRight: 20 }}>
        {[20, 35, 50, 28, 40].map((h, i) => (
          <div key={i} style={{
            width: 14 + i * 3, height: h,
            background: isDusk ? '#1E2E2A' : '#4A7A4A',
            borderRadius: '40% 40% 2px 2px', opacity: 0.5,
          }} />
        ))}
      </div>

      {/* 큰 나무 */}
      <div style={{ position: 'absolute', bottom: '22%', right: '8%', zIndex: 5 }}>
        <PixelTree phase={phase} />
      </div>

      {/* 지면 — 풀밭 레이어 */}
      <div style={{ position: 'absolute', bottom: 0, width: '100%', height: '28%', zIndex: 4 }}>
        {/* 풀 장식 (상단 가장자리) */}
        <div style={{
          position: 'absolute', top: -6, width: '100%', height: 12,
          display: 'flex', gap: 4, justifyContent: 'center', zIndex: 3,
        }}>
          {[...Array(30)].map((_, i) => (
            <div key={i} style={{
              width: 5 + (i % 3) * 2, height: 8 + (i % 4) * 4,
              background: isDusk ? '#2A4A2A' : '#6BAE55',
              borderRadius: '40% 40% 0 0',
              opacity: 0.7 + (i % 3) * 0.1,
            }} />
          ))}
        </div>

        {/* 풀밭 본체 */}
        <div style={{
          width: '100%', height: '45%',
          background: isDusk
            ? 'linear-gradient(180deg, #2A4A2A 0%, #1E3A1E 100%)'
            : 'linear-gradient(180deg, #6BAE55 0%, #5A9E45 100%)',
        }} />
        {/* 흙 레이어 */}
        <div style={{
          width: '100%', height: '35%',
          background: isDusk
            ? 'linear-gradient(180deg, #3A2A1E 0%, #2E1F14 100%)'
            : 'linear-gradient(180deg, #8B6B4A 0%, #6B4F34 100%)',
        }} />
        {/* 바닥 */}
        <div style={{ width: '100%', height: '20%', background: isDusk ? '#1A1410' : '#4A3628' }} />

        {/* 풀밭 위 작은 꽃/풀 */}
        {[10, 25, 45, 65, 80].map((x, i) => (
          <div key={i} style={{
            position: 'absolute', top: 2, left: `${x}%`,
            width: 4, height: 4, borderRadius: '50%',
            background: ['#FFD700', '#FF6B8A', '#87CEEB', '#FFB347', '#FF69B4'][i],
            opacity: isDusk ? 0.4 : 0.7,
          }} />
        ))}
      </div>

      {/* 캐릭터 */}
      <div style={{
        position: 'absolute', bottom: '26%', left: '35%',
        zIndex: 10, animation: 'breathe 3s ease-in-out infinite',
      }}>
        <ChibiAvatar size={56} />
        {/* 캐릭터 그림자 */}
        <div style={{
          width: 36, height: 8, borderRadius: '50%',
          background: 'rgba(0,0,0,0.2)', filter: 'blur(3px)',
          margin: '-2px auto 0',
        }} />
      </div>

      {/* 보석 드롭 (지면 위에 배치) */}
      {todayDrops.map((drop, i) => (
        <div
          key={drop.gem.id}
          className="animate-drop-in"
          style={{
            position: 'absolute',
            left: `${15 + i * 18}%`,
            bottom: '27%',
            zIndex: 8,
            animationDelay: `${i * 250}ms`,
            cursor: 'pointer',
          }}
        >
          <GemStone gem={drop.gem} size={28} />
          {/* 보석 그림자 */}
          <div style={{
            width: 20, height: 5, borderRadius: '50%',
            background: 'rgba(0,0,0,0.15)', filter: 'blur(2px)',
            margin: '1px auto 0',
          }} />
        </div>
      ))}

      {/* 빈 상태 */}
      {todayDrops.length === 0 && (
        <div style={{
          position: 'absolute', bottom: '45%', left: '50%', transform: 'translateX(-50%)',
          textAlign: 'center', zIndex: 15,
          color: isDusk ? 'rgba(255,255,255,0.6)' : 'var(--color-ink-muted)', fontSize: 13,
          background: isDusk ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.7)',
          padding: '10px 20px', borderRadius: 'var(--radius-md)',
          backdropFilter: 'blur(4px)',
        }}>
          <p>오늘 채집한 보석이 없어요</p>
          <p style={{ fontSize: 11, marginTop: 3, opacity: 0.7 }}>카카오톡에서 일상을 보내보세요 💎</p>
        </div>
      )}
    </div>
  );
}
