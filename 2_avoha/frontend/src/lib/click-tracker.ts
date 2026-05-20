// === ClickTracker — data-track 속성이 붙은 element 클릭 자동 추적 ===
// 사용법: <button data-track="header.login">로그인</button>
import { track } from './analytics';

let attached = false;

export function installClickTracker(): void {
  if (attached) return;
  if (typeof document === 'undefined') return;
  attached = true;

  document.addEventListener(
    'click',
    (ev) => {
      const target = ev.target as Element | null;
      if (!target) return;
      const trackable = target.closest('[data-track]') as HTMLElement | null;
      if (!trackable) return;
      const trackId = trackable.getAttribute('data-track') ?? 'unknown';
      const text = (trackable.innerText || trackable.textContent || '').trim().slice(0, 80);
      track('click', {
        trackId,
        text,
        x: ev.clientX,
        y: ev.clientY,
        tag: trackable.tagName.toLowerCase(),
      });
    },
    { capture: true, passive: true },
  );
}
