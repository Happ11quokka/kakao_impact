// === BottomNav — 4탭 하단 네비게이션 바 ===
import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/',         label: '홈' },
  { to: '/analysis', label: '감정분석' },
  { to: '/calendar', label: '캘린더' },
  { to: '/settings', label: '설정' },
];

export default function BottomNav() {
  return (
    <nav
      className="safe-area-bottom"
      style={{
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        height: 70,
        background: 'var(--color-base)',
        borderTop: '1px solid #E5E5E5',
        flexShrink: 0,
      }}
    >
      {tabs.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            textDecoration: 'none',
            width: '25%',
          }}
        >
          {({ isActive }) => (
            <>
              {/* 버튼 동그라미 */}
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: 'var(--color-point-yellow)',
                  border: '1px solid rgba(90, 74, 50, 0.21)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isActive && (
                  <div
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: '50%',
                      background: 'var(--color-point-green-light)',
                      border: '1px solid rgba(90, 74, 50, 0.21)',
                    }}
                  />
                )}
              </div>
              
              {/* 라벨 텍스트 */}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  color: 'var(--color-text-main)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {tab.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
