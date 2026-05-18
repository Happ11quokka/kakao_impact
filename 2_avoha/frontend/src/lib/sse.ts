// === SSE 클라이언트 (/sse/inventory 구독) ===

import { api } from './api';

export type InventoryEvent =
  | { type: 'gem_added'; gem: { id: string; emotionCode: string; tier: number; source: string | null } }
  | { type: 'sticker_added'; sticker: { id: string; imageUrl: string } }
  | {
      type: 'record_updated';
      recordId: number;
      emotionCode: string;
      classificationStatus: string;
    }
  | { type: 'ping' };

export interface InventorySubscriptionOpts {
  onEvent: (ev: InventoryEvent) => void;
  onError?: (err: Event) => void;
  onOpen?: () => void;
}

/**
 * Long-lived SSE 구독. browser EventSource 가 자동 재연결 처리. `.close()` 호출로 종료.
 */
export function subscribeInventory(opts: InventorySubscriptionOpts): () => void {
  const token = api.getToken();
  const url = new URL(`${api.base}/sse/inventory`);
  if (token) url.searchParams.set('token', token);
  const source = new EventSource(url.toString(), { withCredentials: true });

  source.onopen = () => opts.onOpen?.();
  source.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data) as InventoryEvent;
      opts.onEvent(payload);
    } catch {
      /* silently ignore malformed event */
    }
  };
  source.onerror = (err) => {
    opts.onError?.(err);
  };

  return () => source.close();
}
