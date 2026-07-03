// === 이용약관·개인정보 처리방침 본문 ===
// 운영팀이 한 줄로 교체할 수 있도록 상수만 상단에 모아 둠.
import type { CSSProperties, ReactNode } from 'react';

export const LEGAL_VERSION = 'v2026.04';
export const LEGAL_EFFECTIVE_DATE = '2026-05-20';
export const SERVICE_NAME = '아보하';
export const OPERATOR_NAME = '아보하 운영팀';
export const CONTACT_EMAIL = 'support@avoha.today';

const styles: Record<string, CSSProperties> = {
  body: {
    color: 'var(--color-text-main)',
    fontSize: 13,
    lineHeight: 1.7,
    fontFamily: 'var(--font-sans)',
    wordBreak: 'keep-all',
  },
  intro: {
    margin: '0 0 16px',
    color: 'var(--color-text-sub)',
    fontSize: 12,
    lineHeight: 1.6,
  },
  section: {
    margin: '0 0 18px',
  },
  h2: {
    margin: '0 0 8px',
    color: 'var(--color-text-main)',
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0,
  },
  p: {
    margin: '0 0 6px',
  },
  list: {
    margin: '4px 0 0',
    paddingLeft: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    margin: '8px 0 0',
    fontSize: 12,
  },
  th: {
    textAlign: 'left',
    padding: '6px 8px',
    background: 'var(--color-point-yellow)',
    color: 'var(--color-text-main)',
    fontWeight: 800,
    border: '1px solid rgba(86, 71, 48, 0.12)',
  },
  td: {
    padding: '6px 8px',
    border: '1px solid rgba(86, 71, 48, 0.12)',
    color: 'var(--color-text-main)',
    verticalAlign: 'top',
  },
  emphasis: {
    color: 'var(--color-point-green)',
    fontWeight: 800,
  },
  footnote: {
    marginTop: 24,
    padding: 12,
    borderRadius: 12,
    background: 'var(--color-point-yellow)',
    color: 'var(--color-text-sub)',
    fontSize: 11,
    lineHeight: 1.55,
  },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>{title}</h2>
      {children}
    </section>
  );
}

export function TermsContent() {
  return (
    <div style={styles.body}>
      <p style={styles.intro}>
        본 약관은 {SERVICE_NAME}(이하 “서비스”) 와 회원 간의 권리·의무 및 책임 사항을 정합니다. 회원은
        카카오 로그인을 통해 서비스에 가입하므로, 가입과 동시에 본 약관에 동의한 것으로 봅니다.
      </p>

      <Section title="제1조 (목적)">
        <p style={styles.p}>
          이 약관은 회원이 서비스를 이용함에 있어 운영자와 회원의 권리·의무 및 책임 사항, 서비스
          이용 조건과 절차를 규정함을 목적으로 합니다.
        </p>
      </Section>

      <Section title="제2조 (정의)">
        <ul style={styles.list}>
          <li>“회원”이란 카카오 로그인을 완료하여 서비스에 가입한 자를 말합니다.</li>
          <li>
            “콘텐츠”란 회원이 카카오톡 챗봇 또는 웹앱을 통해 입력·전송한 텍스트·사진과 이로부터
            서비스가 생성한 감정 분류 결과를 말합니다.
          </li>
          <li>
            “챗봇”이란 카카오톡 비즈니스 채널 webhook 으로 회원의 메시지를 수신·응답하는 서비스
            구성 요소를 말합니다.
          </li>
        </ul>
      </Section>

      <Section title="제3조 (약관의 효력 및 변경)">
        <p style={styles.p}>
          본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다. 운영자는 관련 법령을 위반하지
          않는 범위에서 약관을 변경할 수 있으며, 변경 시 시행 7일 전(회원에게 불리하거나 중대한
          변경은 30일 전) 본 페이지에 공지합니다.
        </p>
      </Section>

      <Section title="제4조 (회원 가입 및 탈퇴)">
        <ul style={styles.list}>
          <li>
            회원 가입은 카카오 로그인으로 갈음하며, 별도의 비밀번호·실명·주민등록번호를 수집하지
            않습니다.
          </li>
          <li>
            회원 탈퇴 기능은 차기 릴리즈에서 제공될 예정입니다. 그 시점까지는{' '}
            <span style={styles.emphasis}>{CONTACT_EMAIL}</span> 로 요청해 주시면 운영팀이 7일
            이내에 회원 정보 및 연관 기록을 파기합니다.
          </li>
        </ul>
      </Section>

      <Section title="제5조 (서비스 이용)">
        <p style={styles.p}>
          회원은 카카오톡 챗봇에 텍스트·사진을 전송해 감정을 기록할 수 있고, 웹앱(호수·도감·캘린더·
          분석) 에서 본인의 기록을 열람·재분류할 수 있습니다. 본 서비스는 현재 베타 단계이며 일부
          기능이 예고 없이 변경될 수 있습니다.
        </p>
      </Section>

      <Section title="제6조 (이용자의 의무)">
        <ul style={styles.list}>
          <li>타인의 개인정보·저작권·명예를 침해하거나 모욕하는 콘텐츠를 업로드하지 않습니다.</li>
          <li>서비스의 정상 운영을 방해하는 자동화·우회·역엔지니어링 행위를 하지 않습니다.</li>
          <li>
            위반 시 운영자는 회원의 콘텐츠 삭제·서비스 이용 제한·계정 정지를 할 수 있으며, 이로
            인한 손해는 회원이 부담합니다.
          </li>
        </ul>
      </Section>

      <Section title="제7조 (서비스의 제공·변경·중단)">
        <p style={styles.p}>
          서비스는 원칙적으로 연중무휴 24시간 제공되며 현재 무료로 제공됩니다. 단, 시스템 점검·
          장애·외부 의존 서비스(OpenAI, Railway, 카카오) 의 장애 또는 정책 변경 시 일시적으로
          중단되거나 변경될 수 있습니다.
        </p>
      </Section>

      <Section title="제8조 (콘텐츠의 권리)">
        <p style={styles.p}>
          회원이 제출한 텍스트·사진의 저작권은 회원에게 귀속됩니다. 회원은 서비스 운영에 필요한
          범위(저장, 본인 화면 표시, 감정 분류, 통계 산출, 회원 본인 열람용 시각화) 내에서
          서비스가 콘텐츠를 이용할 수 있도록 허락합니다. 운영자는 회원의 콘텐츠를 광고 또는 제3자
          판매 목적으로 이용하지 않습니다.
        </p>
      </Section>

      <Section title="제9조 (면책)">
        <ul style={styles.list}>
          <li>
            서비스가 제공하는 AI 감정 분류 결과는 참고용이며 정확성·완전성을 보장하지 않습니다.
            의료·심리 상담의 대체 수단이 아닙니다.
          </li>
          <li>
            천재지변, 외부 서비스(OpenAI·Railway·카카오) 장애, 회원의 귀책 사유로 인한 손해에
            대하여 운영자는 책임을 지지 않습니다.
          </li>
        </ul>
      </Section>

      <Section title="제10조 (준거법 및 분쟁 해결)">
        <p style={styles.p}>
          본 약관은 대한민국 법을 준거법으로 하며, 서비스 이용과 관련하여 발생한 분쟁은 운영자
          주소지 관할 법원에서 해결합니다.
        </p>
      </Section>

      <Section title="부칙">
        <p style={styles.p}>
          본 약관은 {LEGAL_EFFECTIVE_DATE} 부터 시행하며 버전은 {LEGAL_VERSION} 입니다.
        </p>
      </Section>

      <div style={styles.footnote}>
        문의: {OPERATOR_NAME} · {CONTACT_EMAIL}
      </div>
    </div>
  );
}

export function PrivacyContent() {
  return (
    <div style={styles.body}>
      <p style={styles.intro}>
        {SERVICE_NAME} 는 회원의 감정 기록을 안전하게 보관하기 위해 다음과 같이 개인정보를
        처리하고 있습니다. 본 처리방침은 「개인정보 보호법」 및 관련 법령에 기반합니다.
      </p>

      <Section title="1. 수집하는 개인정보 항목">
        <ul style={styles.list}>
          <li>
            카카오 로그인: 카카오 사용자 ID(kakao_id), 닉네임, 프로필 이미지 URL, 비즈니스 채널
            식별 해시(provider_user_key). 이메일·전화번호·실명은 수집하지 않습니다.
          </li>
          <li>
            챗봇 기록: 회원이 직접 챗봇에 전송한 텍스트와 사진, 서비스가 생성한 감정 분류
            결과(감정 코드), 자기회고 질문·답변, 요청 추적용 식별자(trace_id).
          </li>
          <li>
            자동 수집: 카카오톡 webhook 의 원본 페이로드(chatbot_messages.raw_body), LLM 호출
            로그(프롬프트·응답·소요시간), 오류 로그. 디버깅 및 품질 개선 목적의 운영 로그이며 별도
            광고 식별자나 위치정보는 수집하지 않습니다.
          </li>
        </ul>
      </Section>

      <Section title="2. 수집 방법">
        <ul style={styles.list}>
          <li>카카오 OAuth 콜백을 통해 카카오로부터 인증 정보를 수신합니다.</li>
          <li>회원이 카카오톡 채널로 보낸 메시지를 비즈니스 webhook 으로 수신합니다.</li>
        </ul>
      </Section>

      <Section title="3. 이용 목적">
        <ul style={styles.list}>
          <li>감정 기록 저장 및 웹앱(호수·도감·캘린더·분석) 에서의 시각화.</li>
          <li>AI 감정 분류 결과의 제공 및 챗봇 응답 생성.</li>
          <li>서비스 품질 개선과 장애 대응(에러·LLM 호출 로그 분석).</li>
        </ul>
      </Section>

      <Section title="4. 보유 및 이용 기간">
        <p style={styles.p}>
          회원 탈퇴 시점까지 보관합니다. 회원 탈퇴(또는 {CONTACT_EMAIL} 로의 삭제 요청) 시 회원
          식별 정보(users.deleted_at) 를 표시하고 7일 이내에 연관 기록(챗봇 메시지·감정 기록·
          원석·스티커·Railway Volume 의 사진 사본·로그) 을 파기합니다. 단, 관련 법령에 따른
          보존 의무가 있는 경우 해당 기간 동안 보관합니다.
        </p>
      </Section>

      <Section title="5. 개인정보의 제3자 제공">
        <p style={styles.p}>
          서비스는 회원의 별도 동의 없이 개인정보를 제3자에게 제공하지 않습니다.
        </p>
      </Section>

      <Section title="6. 개인정보의 처리 위탁">
        <p style={styles.p}>서비스 제공을 위해 다음의 업체에 개인정보 처리를 위탁합니다.</p>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>수탁자</th>
              <th style={styles.th}>위탁 업무</th>
              <th style={styles.th}>처리 국가</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={styles.td}>(주)카카오</td>
              <td style={styles.td}>카카오 로그인(OAuth) 인증, 비즈니스 챗봇 메시지 수발신</td>
              <td style={styles.td}>대한민국</td>
            </tr>
            <tr>
              <td style={styles.td}>OpenAI, L.L.C.</td>
              <td style={styles.td}>
                감정 분류용 텍스트 처리 (gpt-4.1-mini).{' '}
                <span style={styles.emphasis}>사진은 전송하지 않습니다.</span>
              </td>
              <td style={styles.td}>미국</td>
            </tr>
            <tr>
              <td style={styles.td}>Railway Corp.</td>
              <td style={styles.td}>
                애플리케이션 호스팅, PostgreSQL/Redis, 사진 사본 저장(Volume)
              </td>
              <td style={styles.td}>미국</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="7. 정보주체의 권리">
        <p style={styles.p}>
          회원은 언제든지 본인의 개인정보 열람·정정·삭제·처리 정지를 요청할 수 있으며, 동의 철회는
          회원 탈퇴와 동일하게 처리됩니다. 요청은 {CONTACT_EMAIL} 으로 보내주시면 7일 이내에
          처리합니다.
        </p>
      </Section>

      <Section title="8. 개인정보 안전성 확보 조치">
        <ul style={styles.list}>
          <li>카카오 OAuth 기반 인증을 사용하며, 비밀번호 자체를 저장하지 않습니다.</li>
          <li>모든 통신은 HTTPS 로 암호화하여 전송합니다.</li>
          <li>
            업로드된 사진은 인증된 회원 본인만 접근할 수 있는 URL 경로로 노출하며, 누끼 처리된
            결과물은 24시간 만료 signed URL 로 제공합니다.
          </li>
          <li>운영 로그 접근은 운영팀에 한정되며, 접근 이력은 별도로 기록합니다.</li>
        </ul>
      </Section>

      <Section title="9. 개인정보 보호 책임자 및 변경 고지">
        <p style={styles.p}>
          개인정보 보호 책임자: {OPERATOR_NAME}
          <br />
          문의: {CONTACT_EMAIL}
        </p>
        <p style={styles.p}>
          본 처리방침은 변경 시 시행 7일 전 본 페이지에 공지합니다. 시행일{' '}
          {LEGAL_EFFECTIVE_DATE} · 버전 {LEGAL_VERSION}.
        </p>
      </Section>

      <div style={styles.footnote}>
        문의: {OPERATOR_NAME} · {CONTACT_EMAIL}
      </div>
    </div>
  );
}
