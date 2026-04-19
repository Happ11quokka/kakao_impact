// === AuthGate — 세션 확인 후 자식 렌더, 미인증이면 /login 으로 ===
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';

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
          gap: 12,
        }}
      >
        <div className="animate-float" style={{ fontSize: 40 }}>💎</div>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: 13 }}>불러오는 중...</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
