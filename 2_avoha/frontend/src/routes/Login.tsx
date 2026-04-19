// === Login — 카카오 로그인 진입 화면 ===
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

const ERROR_MESSAGES: Record<string, string> = {
  token_exchange: '카카오 인증 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.',
  state_mismatch: '보안 검증에 실패했어요. 다시 로그인해주세요.',
  missing_code: '인증 코드가 누락됐어요.',
  invalid_query: '인증 요청이 올바르지 않아요.',
  failed: '로그인이 완료되지 않았어요.',
};

export default function Login() {
  const [params] = useSearchParams();
  const error = params.get('error');
  const errorMsg = error ? (ERROR_MESSAGES[error] ?? '로그인에 실패했어요.') : null;

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
        <div className="animate-float" style={{ fontSize: 64 }}>💎</div>
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
        href={api.loginUrl()}
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
