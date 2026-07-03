// === LoginCallback — Kakao OAuth 콜백: URL fragment 의 bearer 토큰 캡처 ===
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { analytics } from '../lib/analytics';
import { useAuthStore } from '../stores/auth-store';
import ChibiAvatar from '../components/field/ChibiAvatar';

export default function LoginCallback() {
  const navigate = useNavigate();
  const fetchMe = useAuthStore((s) => s.fetchMe);

  useEffect(() => {
    let cancelled = false;

    // #token=... 을 먼저 캡처하고 URL 에서 제거 (히스토리/북마크 노출 방지)
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) {
      const params = new URLSearchParams(hash);
      const token = params.get('token');
      if (token) {
        api.setToken(token);
        window.history.replaceState(null, '', '/login/callback');
      }
    }

    (async () => {
      const user = await fetchMe();
      if (cancelled) return;
      if (user) {
        // 익명 시절 이벤트를 이 user 에 stitching.
        void analytics.linkUser();
        navigate('/', { replace: true });
      } else {
        navigate('/login?error=failed', { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchMe, navigate]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
        background: 'linear-gradient(180deg, #F8E8D8 0%, #FFFAF4 60%, #E8D8C8 100%)',
      }}
    >
      <ChibiAvatar className="animate-float" size={86} />
      <p style={{ color: 'var(--color-ink-muted)', fontSize: 14, margin: 0 }}>
        로그인 마무리 중<span aria-hidden="true">…</span>
      </p>
      <div style={{ display: 'flex', gap: 6 }} aria-hidden="true">
        {[0, 0.15, 0.3].map((delay, i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--color-point-green, #A0BCA8)',
              animation: 'loadingDot 1.2s ease-in-out infinite',
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes loadingDot { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.15); } }
      `}</style>
    </div>
  );
}
