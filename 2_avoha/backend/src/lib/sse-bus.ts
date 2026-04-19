/**
 * 사용자별 SSE 이벤트 브로드캐스트 버스 (in-memory, 싱글 인스턴스용).
 * 분산 배포 시 Redis Pub/Sub 로 교체 (BE-6 확장).
 */
export type InventoryEvent =
  | { type: "gem_added"; gem: { id: string; emotionCode: string; tier: number; source: string | null } }
  | { type: "sticker_added"; sticker: { id: string; imageUrl: string } }
  | { type: "gem_consumed"; ids: string[] }
  | { type: "ping" };

type Subscriber = (ev: InventoryEvent) => void;

const subs = new Map<string, Set<Subscriber>>();

export function subscribe(userId: string, fn: Subscriber): () => void {
  let set = subs.get(userId);
  if (!set) {
    set = new Set();
    subs.set(userId, set);
  }
  set.add(fn);
  return () => {
    const s = subs.get(userId);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) subs.delete(userId);
  };
}

export function publish(userId: string, ev: InventoryEvent): void {
  const set = subs.get(userId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(ev);
    } catch {
      // noop — 구독자 내부 에러가 다른 구독자에 영향 주지 않게
    }
  }
}

export function subscriberCount(userId: string): number {
  return subs.get(userId)?.size ?? 0;
}
