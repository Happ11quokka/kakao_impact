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
      className="safe-area-bottom pixel-panel"
      style={{
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        height: 64,
        borderTop: '2px solid var(--color-brown)',
        background: 'var(--color-peach)',
        flexShrink: 0,
        boxShadow: '0 -2px 0 var(--color-beige)',
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
            fontSize: 11,
            fontWeight: isActive ? 700 : 400,
            color: isActive ? 'var(--color-sunshine)' : 'var(--color-brown)',
            transition: 'color var(--duration-fast) var(--easing-out)',
            fontFamily: 'var(--font-pixel)',
          })}
        >
          {({ isActive }) => (
            <>
              <span style={{ fontSize: 20, filter: isActive ? 'drop-shadow(0 0 2px rgba(255,255,255,0.4))' : 'none' }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
