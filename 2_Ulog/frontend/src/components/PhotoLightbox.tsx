import { useEffect, type CSSProperties } from 'react';

export default function PhotoLightbox({
  url,
  alt = '',
  onClose,
}: {
  url: string | null;
  alt?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!url) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      style={styles.layer}
      onClick={onClose}
    >
      <img
        src={url}
        alt={alt}
        style={styles.image}
        onClick={(event) => event.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="사진 닫기"
        style={styles.close}
      >
        ×
      </button>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  layer: {
    position: 'fixed',
    inset: 0,
    zIndex: 80,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.88)',
    padding: 16,
    boxSizing: 'border-box',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    borderRadius: 6,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
  },
  close: {
    position: 'absolute',
    top: 'max(16px, env(safe-area-inset-top))',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    border: 0,
    background: 'rgba(255, 255, 255, 0.18)',
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
};
