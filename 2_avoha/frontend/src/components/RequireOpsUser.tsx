// === RequireOpsUser — admin/admin Basic Auth 게이트 (카카오 로그인 우회) ===
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';
const STORAGE_KEY = 'avoha_ops_basic';

type State = 'checking' | 'needs_input' | 'allowed';

export function getOpsBasicAuth(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearOpsBasicAuth(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}

// /ops/analytics 진입 시점부터(로그인 폼 단계 포함) body 강제 overflow 풀기.
// OpsAnalytics 가 mount 되기 전 단계에서도 페이지 스크롤 가능.
function useOpsBodyUnlock(): void {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      rootOverflow: root?.style.overflow,
      rootHeight: root?.style.height,
    };
    body.classList.add('ops-analytics-fullscreen');
    html.style.setProperty('overflow', 'auto', 'important');
    html.style.setProperty('height', 'auto', 'important');
    body.style.setProperty('overflow', 'auto', 'important');
    body.style.setProperty('height', 'auto', 'important');
    if (root) {
      root.style.setProperty('overflow', 'visible', 'important');
      root.style.setProperty('height', 'auto', 'important');
    }
    return () => {
      body.classList.remove('ops-analytics-fullscreen');
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      if (root) {
        root.style.overflow = prev.rootOverflow ?? '';
        root.style.height = prev.rootHeight ?? '';
      }
    };
  }, []);
}

export default function RequireOpsUser({ children }: { children: ReactNode }) {
  useOpsBodyUnlock();
  const [state, setState] = useState<State>('checking');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const verify = useCallback(async (basic: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/ops/check`, {
        headers: { Authorization: `Basic ${basic}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const stored = getOpsBasicAuth();
      if (!stored) {
        setState('needs_input');
        return;
      }
      if (await verify(stored)) setState('allowed');
      else {
        clearOpsBasicAuth();
        setState('needs_input');
      }
    })();
  }, [verify]);

  const onSubmit = useCallback(async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const basic = btoa(`${username}:${password}`);
    const ok = await verify(basic);
    setSubmitting(false);
    if (!ok) {
      setError('아이디 또는 비밀번호가 올바르지 않아요.');
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, basic);
    } catch {
      /* silent */
    }
    setState('allowed');
  }, [submitting, username, password, verify]);

  if (state === 'checking') {
    return <div style={styles.center}>권한 확인 중…</div>;
  }

  if (state === 'needs_input') {
    return (
      <div style={styles.screen}>
        <form onSubmit={onSubmit} style={styles.card}>
          <h2 style={styles.title}>운영자 로그인</h2>
          <p style={styles.subtitle}>분석 대시보드 접근용</p>
          <label style={styles.label}>
            <span>아이디</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              data-track="ops.login.username"
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            <span>비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              data-track="ops.login.password"
              style={styles.input}
            />
          </label>
          {error && <p style={styles.error}>{error}</p>}
          <button
            type="submit"
            disabled={submitting || !username || !password}
            data-track="ops.login.submit"
            style={{
              ...styles.submit,
              opacity: submitting || !username || !password ? 0.5 : 1,
            }}
          >
            {submitting ? '확인 중…' : '들어가기'}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}

const styles: Record<string, CSSProperties> = {
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#8B7355',
    fontSize: 13,
  },
  screen: {
    minHeight: '100dvh',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F4EDDF',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    background: '#FFFFFF',
    borderRadius: 14,
    padding: '22px 22px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
  },
  title: { margin: 0, fontSize: 18, fontWeight: 900, color: '#1E3328' },
  subtitle: { margin: '0 0 6px', fontSize: 12, color: '#8B7355' },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 11,
    fontWeight: 800,
    color: '#5A4A32',
  },
  input: {
    height: 38,
    padding: '0 12px',
    border: '1px solid #E0D3BA',
    borderRadius: 8,
    fontSize: 14,
    color: '#1E3328',
    outline: 'none',
  },
  error: { margin: 0, color: '#B23A3A', fontSize: 12, fontWeight: 700 },
  submit: {
    height: 42,
    border: 0,
    borderRadius: 10,
    background: '#1E3328',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    marginTop: 4,
  },
};
