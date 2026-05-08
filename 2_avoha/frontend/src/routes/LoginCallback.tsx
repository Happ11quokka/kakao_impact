// === LoginCallback — Kakao OAuth 콜백: URL fragment 의 bearer 토큰 캡처 ===
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
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
      }}
    >
      <ChibiAvatar className="animate-float" size={86} />
      <p style={{ color: 'var(--color-ink-muted)', fontSize: 14 }}>로그인 중...</p>
    </div>
  );
}
