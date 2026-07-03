// === Settings(마이페이지) 화면 — 로기 톤 통일 + 프로필/통계/단축 ===
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useInventoryStore } from '../stores/inventory-store';
import { useRecordsStore } from '../stores/records-store';
import ChibiAvatar from '../components/field/ChibiAvatar';
import LegalSheet from '../components/LegalSheet';
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from '../content/legal';

const APP_VERSION = '1.0.0';

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeStreakDays(createdAts: string[]): number {
  if (createdAts.length === 0) return 0;
  const dateKeys = new Set(createdAts.map((iso) => toDateKey(new Date(iso))));
  let streak = 0;
  const cursor = new Date();
  while (dateKeys.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function recordsInCurrentMonth(createdAts: string[]): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return createdAts.filter((iso) => {
    const d = new Date(iso);
    return d.getFullYear() === y && d.getMonth() === m;
  }).length;
}

function daysSinceFirstRecord(createdAts: string[]): number | null {
  if (createdAts.length === 0) return null;
  const earliest = createdAts.reduce((min, iso) => (iso < min ? iso : min));
  const start = new Date(earliest);
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

export default function Settings() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { gems, fetchInventory } = useInventoryStore();
  const { records, fetchRecords } = useRecordsStore();
  const [legalOpen, setLegalOpen] = useState<'terms' | 'privacy' | null>(null);

  useEffect(() => {
    fetchInventory();
    fetchRecords();
  }, [fetchInventory, fetchRecords]);

  const stats = useMemo(() => {
    const createdAts = records.map((r) => r.createdAt);
    return {
      gemCount: gems.length,
      monthRecordCount: recordsInCurrentMonth(createdAts),
      streak: computeStreakDays(createdAts),
      sinceDays: daysSinceFirstRecord(createdAts),
    };
  }, [gems, records]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={styles.screen}>
      <div className="no-scrollbar" style={styles.scroll}>
        <header style={styles.header}>
          <h1 style={styles.title}>마이페이지</h1>
          {stats.sinceDays !== null && (
            <p style={styles.subtitle}>로기와 함께한 {stats.sinceDays}일째</p>
          )}
        </header>

        {/* 프로필 카드 */}
        <section aria-label="프로필" style={styles.card}>
          <div style={styles.profileRow}>
            <div style={styles.avatar}>
              {user?.profileUrl ? (
                <img src={user.profileUrl} alt={user.nickname} style={styles.profileImg} />
              ) : (
                <ChibiAvatar size={56} mood="idle" />
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={styles.nickname}>{user?.nickname ?? '로기 친구'}</p>
              <span style={styles.kakaoBadge} aria-label="카카오 연동됨">
                <span style={styles.kakaoDot} aria-hidden /> 카카오 연동됨
              </span>
            </div>
          </div>
        </section>

        {/* 이번 달 활동 */}
        <section aria-label="이번 달 활동" style={styles.statSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>이번 달 활동</h2>
            <p style={styles.sectionCaption}>오늘 기준으로 모아 봤어요.</p>
          </div>
          <div style={styles.statGrid}>
            <StatCell label="원석" value={stats.gemCount} />
            <StatCell label="기록" value={stats.monthRecordCount} unit="개" />
            <StatCell label="연속" value={stats.streak} unit="일" />
          </div>
        </section>

        {/* 빠른 이동 */}
        <section aria-label="빠른 이동" style={styles.shortcutSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>빠른 이동</h2>
          </div>
          <div style={styles.shortcutGrid}>
            <ShortcutCard
              icon="💎"
              title="감정 도감"
              caption="25종의 감정 원석"
              onClick={() => navigate('/', { state: { openBook: true } })}
            />
            <ShortcutCard
              icon="📊"
              title="감정 분석"
              caption="이번 주 흐름 보기"
              onClick={() => navigate('/analysis')}
            />
          </div>
        </section>

        {/* 알림 (준비 중) */}
        <section aria-label="알림 설정" style={styles.listSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>알림</h2>
          </div>
          <PrefRow
            label="기록 리마인더"
            caption="저녁 9시 부드러운 푸시"
            trailing={<ComingSoonChip />}
            disabled
          />
        </section>

        {/* 계정 */}
        <section aria-label="계정" style={styles.listSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>계정</h2>
          </div>
          <ActionRow label="로그아웃" leadingEmoji="🔓" onClick={handleLogout} tone="default" />
          <ActionRow
            label="회원 탈퇴"
            leadingEmoji="🗑"
            tone="danger"
            trailing={<ComingSoonChip />}
            disabled
          />
        </section>

        {/* 앱 정보 */}
        <section aria-label="앱 정보" style={styles.listSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>앱 정보</h2>
          </div>
          <InfoRow label="버전" value={APP_VERSION} />
          <ActionRow
            label="이용약관"
            leadingEmoji="📄"
            onClick={() => setLegalOpen('terms')}
          />
          <ActionRow
            label="개인정보 처리방침"
            leadingEmoji="🔒"
            onClick={() => setLegalOpen('privacy')}
          />
        </section>

        <p style={styles.footerNote}>로기는 너의 감정을 안전하게 지킬게요.</p>
        <p style={styles.footerMeta}>
          약관 {LEGAL_VERSION} · 시행 {LEGAL_EFFECTIVE_DATE}
        </p>
      </div>

      <LegalSheet
        open={legalOpen !== null}
        kind={legalOpen ?? 'terms'}
        onClose={() => setLegalOpen(null)}
      />
    </div>
  );
}

function StatCell({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div style={styles.statCell}>
      <span style={styles.statValueRow}>
        <strong style={styles.statValue}>{value}</strong>
        {unit && <span style={styles.statUnit}>{unit}</span>}
      </span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function ShortcutCard({
  icon,
  title,
  caption,
  onClick,
}: {
  icon: string;
  title: string;
  caption: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={styles.shortcutCard}>
      <span style={styles.shortcutIcon} aria-hidden>
        {icon}
      </span>
      <span style={styles.shortcutBody}>
        <strong style={styles.shortcutTitle}>{title}</strong>
        <span style={styles.shortcutCaption}>{caption}</span>
      </span>
      <span style={styles.shortcutChevron} aria-hidden>
        ›
      </span>
    </button>
  );
}

function PrefRow({
  label,
  caption,
  trailing,
  disabled,
}: {
  label: string;
  caption?: string;
  trailing?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div style={{ ...styles.row, ...(disabled ? styles.rowDisabled : null) }}>
      <span style={styles.rowBody}>
        <span style={styles.rowLabel}>{label}</span>
        {caption && <span style={styles.rowCaption}>{caption}</span>}
      </span>
      {trailing}
    </div>
  );
}

function ActionRow({
  label,
  leadingEmoji,
  onClick,
  trailing,
  disabled,
  tone = 'default',
}: {
  label: string;
  leadingEmoji?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...styles.row,
        ...styles.rowButton,
        ...(disabled ? styles.rowDisabled : null),
        ...(tone === 'danger' ? styles.rowDanger : null),
      }}
    >
      {leadingEmoji && (
        <span aria-hidden style={styles.rowLeadingEmoji}>
          {leadingEmoji}
        </span>
      )}
      <span style={{ ...styles.rowLabel, flex: 1, textAlign: 'left' }}>{label}</span>
      {trailing ?? <span aria-hidden style={styles.rowChevron}>›</span>}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.row}>
      <span style={{ ...styles.rowLabel, flex: 1 }}>{label}</span>
      <span style={styles.rowMeta}>{value}</span>
    </div>
  );
}

function ComingSoonChip() {
  return <span style={styles.chip}>준비 중</span>;
}

const CARD_BG = 'rgba(255,255,255,0.86)';
const CARD_BORDER = '1px solid rgba(86, 71, 48, 0.08)';
const CARD_SHADOW = '0 6px 18px rgba(86, 71, 48, 0.05)';

const styles: Record<string, CSSProperties> = {
  screen: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-base)',
    color: 'var(--color-text-main)',
    fontFamily: 'var(--font-sans)',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: 'calc(24px + env(safe-area-inset-top)) 16px calc(96px + env(safe-area-inset-bottom))',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    padding: '0 4px',
  },
  title: {
    margin: 0,
    color: 'var(--color-text-main)',
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: 0,
  },
  subtitle: {
    margin: '4px 0 0',
    color: 'var(--color-text-sub)',
    fontSize: 11,
    fontWeight: 600,
  },
  card: {
    padding: 16,
    borderRadius: 18,
    background: CARD_BG,
    border: CARD_BORDER,
    boxShadow: CARD_SHADOW,
  },
  profileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: '50%',
    background: 'var(--color-point-yellow)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  profileImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  nickname: {
    margin: 0,
    color: 'var(--color-text-main)',
    fontSize: 16,
    fontWeight: 800,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  kakaoBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    padding: '3px 9px',
    borderRadius: 999,
    background: 'rgba(61, 107, 80, 0.12)',
    color: 'var(--color-point-green)',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  kakaoDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--color-point-green)',
    display: 'inline-block',
  },
  statSection: {
    padding: 14,
    borderRadius: 18,
    background: CARD_BG,
    border: CARD_BORDER,
    boxShadow: CARD_SHADOW,
  },
  sectionHeader: {
    marginBottom: 8,
    paddingLeft: 2,
  },
  sectionTitle: {
    margin: 0,
    color: 'var(--color-text-main)',
    fontSize: 13,
    fontWeight: 800,
  },
  sectionCaption: {
    margin: '2px 0 0',
    color: 'var(--color-text-sub)',
    fontSize: 10,
    fontWeight: 600,
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
  },
  statCell: {
    padding: '12px 6px',
    borderRadius: 14,
    background: 'var(--color-base)',
    border: '1px solid rgba(86, 71, 48, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statValueRow: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 2,
    color: 'var(--color-point-green)',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },
  statUnit: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--color-text-sub)',
  },
  statLabel: {
    color: 'var(--color-text-sub)',
    fontSize: 11,
    fontWeight: 700,
  },
  shortcutSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  shortcutGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  },
  shortcutCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    border: CARD_BORDER,
    background: CARD_BG,
    boxShadow: CARD_SHADOW,
    cursor: 'pointer',
    textAlign: 'left',
    WebkitTapHighlightColor: 'transparent',
  },
  shortcutIcon: {
    fontSize: 22,
    width: 36,
    height: 36,
    borderRadius: 12,
    background: 'var(--color-point-yellow)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  shortcutBody: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    flex: 1,
  },
  shortcutTitle: {
    color: 'var(--color-text-main)',
    fontSize: 12,
    fontWeight: 800,
  },
  shortcutCaption: {
    color: 'var(--color-text-sub)',
    fontSize: 10,
    fontWeight: 600,
    marginTop: 2,
  },
  shortcutChevron: {
    color: 'var(--color-text-sub)',
    fontSize: 16,
    fontWeight: 700,
    flexShrink: 0,
  },
  listSection: {
    padding: '10px 4px 4px',
    borderRadius: 18,
    background: CARD_BG,
    border: CARD_BORDER,
    boxShadow: CARD_SHADOW,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 12px',
    minHeight: 48,
    background: 'transparent',
  },
  rowButton: {
    border: 0,
    width: '100%',
    cursor: 'pointer',
    color: 'var(--color-text-main)',
    fontFamily: 'inherit',
    fontSize: 13,
    WebkitTapHighlightColor: 'transparent',
  },
  rowDisabled: {
    cursor: 'default',
    opacity: 0.6,
  },
  rowDanger: {
    color: '#8E2F2F',
  },
  rowLeadingEmoji: {
    fontSize: 16,
    width: 20,
    textAlign: 'center',
  },
  rowBody: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: 700,
  },
  rowCaption: {
    color: 'var(--color-text-sub)',
    fontSize: 11,
    marginTop: 2,
  },
  rowMeta: {
    color: 'var(--color-text-sub)',
    fontSize: 12,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  rowChevron: {
    color: 'var(--color-text-sub)',
    fontSize: 18,
    fontWeight: 700,
  },
  chip: {
    padding: '3px 8px',
    borderRadius: 999,
    background: 'rgba(86, 71, 48, 0.08)',
    color: 'var(--color-text-sub)',
    fontSize: 10,
    fontWeight: 800,
  },
  footerNote: {
    marginTop: 8,
    textAlign: 'center',
    color: 'var(--color-text-sub)',
    fontSize: 10,
    fontWeight: 600,
  },
  footerMeta: {
    margin: '4px 0 0',
    textAlign: 'center',
    color: 'var(--color-text-sub)',
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 0.2,
    opacity: 0.7,
  },
};
