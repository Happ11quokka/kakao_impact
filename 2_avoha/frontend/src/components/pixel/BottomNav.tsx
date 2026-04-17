// === BottomNav — 5탭 하단 네비게이션 바 ===
import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/',          icon: '🏠', label: '필드' },
  { to: '/inventory', icon: '🎒', label: '인벤토리' },
  { to: '/workshop',  icon: '🔨', label: '세공소' },
  { to: '/book',      icon: '📖', label: '도감' },
  { to: '/me',        icon: '👤', label: '마이' },
];

export default function BottomNav() {
  return (
    <nav
      className="safe-area-bottom"
      style={{
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        height: 64,
        borderTop: '1px solid var(--color-surface-dim)',
        background: 'var(--color-parchment)',
        flexShrink: 0,
      }}
    >
      {tabs.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          style={({ isActive }) => ({
            display: 'flex',
            flexDirection: 'column' as const,
            alignItems: 'center',
            gap: 2,
            textDecoration: 'none',
            fontSize: 10,
            fontWeight: isActive ? 700 : 400,
            color: isActive ? 'var(--color-coral)' : 'var(--color-ink-muted)',
            transition: 'color var(--duration-fast) var(--easing-out)',
          })}
        >
          <span style={{ fontSize: 22 }}>{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
