// === LoginCallback — Kakao OAuth 콜백 처리 (세션 쿠키 기반) ===
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';

export default function LoginCallback() {
  const navigate = useNavigate();
  const fetchMe = useAuthStore((s) => s.fetchMe);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await fetchMe();
      if (cancelled) return;
      if (user) {
        navigate('/', { replace: true });
      } else {
        navigate('/?login=failed', { replace: true });
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
      <div className="animate-float" style={{ fontSize: 48 }}>💎</div>
      <p style={{ color: 'var(--color-ink-muted)', fontSize: 14 }}>로그인 중...</p>
    </div>
  );
}
