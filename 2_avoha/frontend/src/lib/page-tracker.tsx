// === PageTracker — 라우트 변경 감지 후 page.view / page.dwell 발사 ===
// App.tsx 의 BrowserRouter 직하에 1회 마운트.
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { track } from './analytics';

export default function PageTracker() {
  const location = useLocation();
  const enteredAtRef = useRef<number>(Date.now());
  const scrollMaxRef = useRef<number>(0);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    // 스크롤 깊이 추적 (페이지 단위 최대값 누적).
    const onScroll = () => {
      const doc = document.documentElement;
      const denom = Math.max(doc.scrollHeight - window.innerHeight, 1);
      const pct = Math.min(100, Math.round((window.scrollY / denom) * 100));
      if (pct > scrollMaxRef.current) scrollMaxRef.current = pct;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const path = location.pathname;
    const now = Date.now();

    // 이전 페이지의 dwell 을 먼저 정산.
    if (prevPathRef.current && prevPathRef.current !== path) {
      const dwell = now - enteredAtRef.current;
      track('page.dwell', {
        path: prevPathRef.current,
        durationMs: dwell,
        scrollDepthPct: scrollMaxRef.current,
      });
    }

    // 새 페이지 view + 카운터 리셋.
    track('page.view', {
      path,
      referrer: document.referrer || undefined,
      viewport: { w: window.innerWidth, h: window.innerHeight },
    });
    prevPathRef.current = path;
    enteredAtRef.current = now;
    scrollMaxRef.current = 0;
  }, [location.pathname]);

  useEffect(() => {
    // 탭 숨김 / 종료 직전에도 마지막 dwell 발사.
    const flushDwell = () => {
      if (!prevPathRef.current) return;
      const dwell = Date.now() - enteredAtRef.current;
      track('page.dwell', {
        path: prevPathRef.current,
        durationMs: dwell,
        scrollDepthPct: scrollMaxRef.current,
        reason: 'hide',
      });
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushDwell();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flushDwell);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flushDwell);
    };
  }, []);

  return null;
}
