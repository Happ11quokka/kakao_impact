// === 풀스크린 시트 — 이용약관 / 개인정보 처리방침 본문 보여주기 ===
import { useEffect, type CSSProperties } from 'react';
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  PrivacyContent,
  TermsContent,
} from '../content/legal';

type LegalKind = 'terms' | 'privacy';

type Props = {
  open: boolean;
  kind: LegalKind;
  onClose: () => void;
};

const TITLE: Record<LegalKind, string> = {
  terms: '이용약관',
  privacy: '개인정보 처리방침',
};

export default function LegalSheet({ open, kind, onClose }: Props) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={styles.backdrop}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={TITLE[kind]}
        style={styles.card}
      >
        <header style={styles.header}>
          <div style={styles.headerTitleBlock}>
            <h1 style={styles.title}>{TITLE[kind]}</h1>
            <span style={styles.meta}>
              {LEGAL_VERSION} · 시행 {LEGAL_EFFECTIVE_DATE}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={styles.closeButton}
          >
            ×
          </button>
        </header>
        <div className="no-scrollbar" style={styles.body}>
          {kind === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </div>
      </section>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(20, 14, 8, 0.35)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    zIndex: 40,
    animation: 'backdropFadeIn 0.22s ease-out',
  },
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 56,
    bottom: 24,
    borderRadius: 20,
    overflow: 'hidden',
    background: 'var(--color-base)',
    boxShadow: '0 24px 60px rgba(86, 71, 48, 0.28)',
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
    animation: 'overlayCardIn 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 16px 10px',
    borderBottom: '1px solid rgba(86, 71, 48, 0.08)',
    background: 'rgba(255, 255, 255, 0.86)',
  },
  headerTitleBlock: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  title: {
    margin: 0,
    color: 'var(--color-text-main)',
    fontSize: 16,
    fontWeight: 800,
  },
  meta: {
    color: 'var(--color-text-sub)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: '1px solid rgba(86, 71, 48, 0.16)',
    background: '#F7F2EA',
    color: 'var(--color-text-sub)',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: 16,
  },
};
