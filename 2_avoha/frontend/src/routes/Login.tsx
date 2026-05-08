// === Login — 카카오 로그인 진입 화면 + 챗봇 해시(kakao_hash) 캡처 ===
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import ChibiAvatar from '../components/field/ChibiAvatar';

const ERROR_MESSAGES: Record<string, string> = {
  token_exchange: '카카오 인증 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.',
  state_mismatch: '보안 검증에 실패했어요. 다시 로그인해주세요.',
  missing_code: '인증 코드가 누락됐어요.',
  invalid_query: '인증 요청이 올바르지 않아요.',
  failed: '로그인이 완료되지 않았어요.',
};

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const error = params.get('error');
  const errorMsg = error ? (ERROR_MESSAGES[error] ?? '로그인에 실패했어요.') : null;

  // 마운트 시점에 URL 에서 한 번만 캡처 → 이후 URL 이 바뀌어도 href 에는 유지됨.
  // useState 이니셜라이저로 SSR 안전한 window 접근.
  const [capturedHash] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('kakao_hash');
  });
  const [attaching, setAttaching] = useState(false);

  // ?kakao_hash= 도착 처리:
  //  - URL 에서 즉시 제거 (히스토리/북마크 노출 방지)
  //  - 토큰 있으면 /me/provider-user-key 에 붙이고 홈으로
  //  - 토큰 없으면 로그인 버튼 클릭을 기다림 (href 에 이미 실림)
  useEffect(() => {
    if (!capturedHash) return;

    // URL 정리
    const url = new URL(window.location.href);
    url.searchParams.delete('kakao_hash');
    window.history.replaceState(null, '', url.toString());

    const token = api.getToken();
    if (!token) return; // OAuth 플로우에서 처리됨 (loginUrl 에 실림)

    setAttaching(true);
    api
      .setProviderUserKey(capturedHash)
      .then(() => navigate('/', { replace: true }))
      .catch((err) => {
        // 토큰 만료/무효 → 로그아웃 상태로 전환, OAuth 플로우로 자연 폴백
        if (err instanceof ApiError && err.status === 401) {
          api.setToken(null);
        }
        setAttaching(false);
      });
  }, [capturedHash, navigate]);

  if (attaching) {
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
        <p style={{ color: 'var(--color-ink-muted)', fontSize: 14 }}>챗봇과 연결 중...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        gap: 24,
        background: 'linear-gradient(180deg, #F8E8D8 0%, #FFFAF4 60%, #E8D8C8 100%)',
      }}
    >
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ChibiAvatar className="animate-float" size={104} />
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 700, color: 'var(--color-ink)' }}>
          아보하
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', lineHeight: 1.6 }}>
          카카오톡 일상이 감정 광물이 됩니다.
          <br />
          오늘 하루를 채집해보세요.
        </p>
      </div>

      {errorMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-coral-light)',
            border: '1px solid var(--color-coral)',
            color: 'var(--color-coral)',
            fontSize: 13,
            textAlign: 'center',
            maxWidth: 300,
          }}
        >
          {errorMsg}
        </div>
      )}

      <a
        href={api.loginUrl(capturedHash)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '14px 28px',
          borderRadius: 'var(--radius-full)',
          background: '#FEE500',
          color: '#191919',
          fontSize: 15,
          fontWeight: 700,
          textDecoration: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          minWidth: 240,
        }}
      >
        <span style={{ fontSize: 18 }}>💬</span>
        카카오로 시작하기
      </a>

      <p style={{ fontSize: 11, color: 'var(--color-ink-muted)', textAlign: 'center', lineHeight: 1.6 }}>
        로그인 시 프로필(닉네임 · 프로필 이미지) 정보만
        <br />
        수집하며, 언제든 마이페이지에서 탈퇴 가능합니다.
      </p>
    </div>
  );
}
