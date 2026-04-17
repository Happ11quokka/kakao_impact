// === LoginCallback — Kakao OAuth 콜백 처리 ===
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';

export default function LoginCallback() {
  const navigate = useNavigate();
  const login = useAuthStore(s => s.login);

  useEffect(() => {
    // Mock: 실제로는 URL query에서 code 추출 → 백엔드 /auth/kakao/callback 호출
    const mockLogin = async () => {
      await new Promise(r => setTimeout(r, 1000));
      login('mock-token', { nickname: '보석 채집가', profileUrl: '' });
      navigate('/', { replace: true });
    };
    mockLogin();
  }, [login, navigate]);

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16,
    }}>
      <div className="animate-float" style={{ fontSize: 48 }}>💎</div>
      <p style={{ color: 'var(--color-ink-muted)', fontSize: 14 }}>로그인 중...</p>
    </div>
  );
}
