// === MyPage 화면 — 마이페이지 ===
import { useEffect, useMemo } from 'react';
import { useInventoryStore } from '../stores/inventory-store';
import { MOCK_DAILY_INDICES, MOCK_USER } from '../data/mock-data';
import { FIELD_SKY, fieldPageChrome, useFieldTimePhase } from '../lib/field-time';

/** 아보하 지수 계산 (PRD 8.3) */
function calcAvohaIndex(dailyIndices: number[]): number {
  if (dailyIndices.length === 0) return 0;
  const last7 = dailyIndices.slice(-7);
  const rolling7d = last7.reduce((a, b) => a + b, 0) / last7.length;
  return Math.min(100, Math.round((rolling7d * 100) / 150));
}

export default function MyPage() {
  const phase = useFieldTimePhase();
  const chrome = fieldPageChrome(phase);
  const { gems, fetchInventory } = useInventoryStore();
  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  const avohaIndex = useMemo(() => calcAvohaIndex(MOCK_DAILY_INDICES), []);
  const activeGems = gems.filter(g => !g.consumedAt);

  // 간단한 SVG 그래프 (Recharts 대신 경량 구현)
  const graphData = MOCK_DAILY_INDICES;
  const maxVal = Math.max(...graphData, 1);
  const graphWidth = 300;
  const graphHeight = 100;
  const points = graphData.map((v, i) => ({
    x: (i / (graphData.length - 1)) * graphWidth,
    y: graphHeight - (v / maxVal) * graphHeight,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${graphWidth} ${graphHeight} L 0 ${graphHeight} Z`;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: FIELD_SKY[phase],
      transition: 'background 2s ease',
    }}>
      <div className="no-scrollbar" style={{ flex: 1, overflow: 'auto' }}>
        {/* 헤더 */}
        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 700, color: chrome.title }}>마이페이지</h1>
        </div>

        {/* 프로필 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '0 16px', marginBottom: 24,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-coral), var(--color-amber))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
          }}>
            🧑‍🌾
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 18, color: chrome.title }}>{MOCK_USER.nickname}</p>
            <div style={{
              marginTop: 4, fontSize: 12, color: 'var(--color-mint)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-mint)' }} />
              카카오 연동됨
            </div>
          </div>
        </div>

        {/* 아보하 지수 */}
        <div style={{
          margin: '0 16px', padding: 20,
          borderRadius: 'var(--radius-lg)',
          background: chrome.card,
          boxShadow: 'var(--elevation-1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>📊 아보하 지수</h2>
            <span style={{
              fontSize: 28, fontWeight: 700,
              color: avohaIndex >= 70 ? 'var(--color-mint)' : avohaIndex >= 40 ? 'var(--color-amber)' : 'var(--color-coral)',
            }}>
              {avohaIndex}
            </span>
          </div>

          {/* SVG 그래프 */}
          <svg viewBox={`-4 -4 ${graphWidth + 8} ${graphHeight + 8}`} style={{ width: '100%', height: 120 }}>
            {/* 영역 채우기 */}
            <path d={areaD} fill="url(#gradient)" opacity="0.15" />
            {/* 선 */}
            <path d={pathD} fill="none" stroke="var(--color-coral)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* 마지막 점 */}
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4" fill="var(--color-coral)" />
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="7" fill="var(--color-coral)" opacity="0.2" />
            <defs>
              <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-coral)" />
                <stop offset="100%" stopColor="var(--color-amber)" />
              </linearGradient>
            </defs>
          </svg>

          <p style={{ fontSize: 11, color: 'var(--color-ink-muted)', textAlign: 'center', marginTop: 8 }}>
            최근 14일 기준
          </p>
        </div>

        {/* 통계 카드 */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10, padding: '20px 16px',
        }}>
          {[
            { icon: '🔥', label: '연속 채집', value: `${MOCK_USER.streakDays}일` },
            { icon: '📊', label: '총 채집', value: `${MOCK_USER.totalCollections}회` },
            { icon: '💎', label: '보유 보석', value: `${activeGems.length}개` },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="animate-scale-pop"
              style={{
                animationDelay: `${i * 80}ms`,
                padding: 16, borderRadius: 'var(--radius-md)',
                background: chrome.card,
                textAlign: 'center',
                boxShadow: 'var(--elevation-1)',
              }}
            >
              <div style={{ fontSize: 24 }}>{stat.icon}</div>
              <p style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: 'var(--color-ink)' }}>{stat.value}</p>
              <p style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 2 }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* 설정 */}
        <div style={{ padding: '0 16px 40px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: chrome.title }}>설정</h2>
          {[
            { label: '📦 데이터 내려받기', color: 'var(--color-ink)', danger: false },
            { label: '🔓 로그아웃', color: 'var(--color-ink)', danger: false },
            { label: '⚠️ 탈퇴하기', color: 'var(--color-coral)', danger: true },
          ].map(item => (
            <button
              key={item.label}
              style={{
                display: 'block', width: '100%',
                padding: '14px 16px', marginBottom: 8,
                borderRadius: 'var(--radius-md)',
                border: item.danger ? '1px solid var(--color-coral)' : '1px solid var(--color-surface-dim)',
                background: item.danger ? 'var(--color-coral-light)' : chrome.card,
                color: item.color,
                fontSize: 14, fontWeight: 500,
                textAlign: 'left', cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
