// === AuthGate — 세션 확인 후 자식 렌더, 미인증이면 /login 으로 ===
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';
import ChibiAvatar from './field/ChibiAvatar';

interface Props {
  children: React.ReactNode;
}

export default function AuthGate({ children }: Props) {
  const status = useAuthStore((s) => s.status);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  useEffect(() => {
    if (status === 'idle') {
      // 토큰 없이 /me 쿼리해봤자 401 → 바로 /login 으로.
      if (!api.getToken()) {
        useAuthStore.setState({ status: 'unauthenticated' });
        return;
      }
      void fetchMe();
    }
  }, [status, fetchMe]);

  if (status === 'idle' || status === 'loading') {
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
          불러오는 중<span aria-hidden="true">…</span>
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

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
