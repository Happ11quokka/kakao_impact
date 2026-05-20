// === RequireOpsUser — 운영자(OPS_ALLOWED_KAKAO_IDS)만 통과 ===
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

type State = 'checking' | 'allowed' | 'denied';

export default function RequireOpsUser({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('avoha_token');
        const res = await fetch(`${API_URL}/ops/check`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        setState(res.ok ? 'allowed' : 'denied');
      } catch {
        if (!cancelled) setState('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'checking') {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-ink-muted, #8B7355)',
          fontSize: 13,
        }}
      >
        권한 확인 중<span aria-hidden="true">…</span>
      </div>
    );
  }

  if (state === 'denied') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
