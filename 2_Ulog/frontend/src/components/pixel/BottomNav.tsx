// === BottomNav — 4탭 하단 네비게이션 바 ===
import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/',         label: '홈',        track: 'nav.home' },
  { to: '/analysis', label: '감정분석',  track: 'nav.analysis' },
  { to: '/calendar', label: '캘린더',    track: 'nav.calendar' },
  { to: '/settings', label: '설정',      track: 'nav.settings' },
];

export default function BottomNav() {
  return (
    <nav
      className="safe-area-bottom"
      style={{
        position: 'relative',
        zIndex: 50,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        minHeight: 70,
        paddingTop: 6,
        background: 'var(--color-base)',
        borderTop: '1px solid #E5E5E5',
        flexShrink: 0,
        boxShadow: '0 -1px 10px rgba(86, 71, 48, 0.06)',
      }}
    >
      {tabs.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          data-track={tab.track}
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
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'rgba(160, 188, 168, 0.24)',
                      border: '1px solid rgba(160, 188, 168, 0.62)',
                      boxShadow:
                        '0 0 0 2px rgba(160, 188, 168, 0.24), 0 0 12px rgba(160, 188, 168, 0.5), 0 0 22px rgba(160, 188, 168, 0.3)',
                      backdropFilter: 'blur(0.35px)',
                      transform: 'translateZ(0)',
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
