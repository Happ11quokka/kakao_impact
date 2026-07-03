// === MyPage 화면 — 마이페이지 (실 유저 연동) ===
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useInventoryStore } from '../stores/inventory-store';
import { FIELD_SKY, fieldPageChrome, useFieldTimePhase } from '../lib/field-time';

export default function MyPage() {
  const phase = useFieldTimePhase();
  const chrome = fieldPageChrome(phase);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const tickets = useAuthStore((s) => s.tickets);
  const logout = useAuthStore((s) => s.logout);
  const { gems, fetchInventory } = useInventoryStore();

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  const activeGems = gems.filter((g) => !g.consumedAt);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: FIELD_SKY[phase],
        transition: 'background 2s ease',
      }}
    >
      <div className="no-scrollbar" style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 700, color: chrome.title }}>
            마이페이지
          </h1>
        </div>

        {/* 프로필 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', marginBottom: 24 }}>
          {user?.profileUrl ? (
            <img
              src={user.profileUrl}
              alt={user.nickname}
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                objectFit: 'cover',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--color-coral), var(--color-amber))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
              }}
            >
              🧑‍🌾
            </div>
          )}
          <div>
            <p style={{ fontWeight: 700, fontSize: 18, color: chrome.title }}>
              {user?.nickname ?? '…'}
            </p>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: 'var(--color-mint)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-mint)' }} />
              카카오 연동됨
            </div>
          </div>
        </div>

        {/* 오늘의 채집권 */}
        <div
          style={{
            margin: '0 16px 20px',
            padding: 20,
            borderRadius: 'var(--radius-lg)',
            background: chrome.card,
            boxShadow: 'var(--elevation-1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>🎟️ 오늘의 채집권</h2>
              <p style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 4 }}>
                하루 5개 · 자정(KST) 에 충전
              </p>
            </div>
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: (tickets?.remaining ?? 0) > 2 ? 'var(--color-mint)' : 'var(--color-coral)',
              }}
            >
              {tickets?.remaining ?? 0}
              <span style={{ fontSize: 14, color: 'var(--color-ink-muted)', fontWeight: 400 }}> / 5</span>
            </span>
          </div>
        </div>

        {/* 통계 카드 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            padding: '0 16px 20px',
          }}
        >
          {[
            { icon: '💎', label: '보유 보석', value: `${activeGems.length}개` },
            { icon: '🔥', label: '연속 채집', value: '집계중' },
            { icon: '📊', label: '총 채집', value: '집계중' },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="animate-scale-pop"
              style={{
                animationDelay: `${i * 80}ms`,
                padding: 16,
                borderRadius: 'var(--radius-md)',
                background: chrome.card,
                textAlign: 'center',
                boxShadow: 'var(--elevation-1)',
              }}
            >
              <div style={{ fontSize: 24 }}>{stat.icon}</div>
              <p
                style={{
                  fontSize: stat.value === '집계중' ? 11 : 18,
                  fontWeight: 700,
                  marginTop: 4,
                  color: stat.value === '집계중' ? 'var(--color-ink-muted)' : 'var(--color-ink)',
                }}
              >
                {stat.value}
              </p>
              <p style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 2 }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* 설정 */}
        <div style={{ padding: '0 16px 40px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: chrome.title }}>설정</h2>
          <button
            onClick={handleLogout}
            style={{
              display: 'block',
              width: '100%',
              padding: '14px 16px',
              marginBottom: 8,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-surface-dim)',
              background: chrome.card,
              color: 'var(--color-ink)',
              fontSize: 14,
              fontWeight: 500,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            🔓 로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
