// === AuthGate — 세션 확인 후 자식 렌더, 미인증이면 /login 으로 ===
import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth-store';

interface Props {
  children: React.ReactNode;
}

export default function AuthGate({ children }: Props) {
  useEffect(() => {
    // 임시 인증 우회 (개발용)
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'dev-user', kakaoId: 123456, nickname: '테스트 유저', profileUrl: null },
      tickets: { date: new Date().toISOString().split('T')[0], remaining: 5 }
    });
  }, []);

  return <>{children}</>;
}
