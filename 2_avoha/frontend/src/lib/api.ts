// === API 클라이언트 (FastAPI 백엔드 연동) ===
// VITE_API_URL 환경변수로 backend base URL 지정. dev 기본값: http://localhost:8000

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public body: unknown,
  ) {
    super(`${status} ${code}`);
  }
}

type JsonInit = Omit<RequestInit, 'body'> & { json?: unknown };

async function request<T>(path: string, init: JsonInit = {}): Promise<T> {
  const headers: HeadersInit = {
    ...(init.headers ?? {}),
    ...(init.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
  };
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : (init as RequestInit).body,
  });
  const contentType = res.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await res.json().catch(() => ({}))
    : undefined;
  if (!res.ok) {
    const code =
      (payload as { error?: { code?: string } } | undefined)?.error?.code ?? 'HTTP_ERROR';
    throw new ApiError(res.status, code, payload);
  }
  return payload as T;
}

// ── 응답 타입 (FastAPI 직렬화 기준) ──

export interface MeResponse {
  user: {
    id: string;
    kakaoId: number;
    nickname: string;
    profileUrl: string | null;
  };
  tickets: { date: string; remaining: number };
}

export interface GemDto {
  id: string;
  emotionCode: string;
  tier: 1 | 2 | 3 | 4;
  source: string | null;
  sourceMessageId: string | null;
  craftedFrom: string[];
  createdAt: string;
}

export interface StickerDto {
  id: string;
  imageUrl: string;
  polaroidFallback: boolean;
  placedOnField: boolean;
  sourceMessageId: string | null;
  createdAt: string;
}

export interface FieldDropDto extends GemDto {
  position: { x: number; y: number }; // 0..1 범위
}

export const api = {
  base: API_URL,

  loginUrl(): string {
    return `${API_URL}/auth/kakao/login`;
  },

  me: () => request<MeResponse>('/me'),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  gems: (params?: { emotion?: string; tier?: number }) => {
    const qs = new URLSearchParams();
    if (params?.emotion) qs.set('emotion', params.emotion);
    if (params?.tier) qs.set('tier', String(params.tier));
    const suffix = qs.toString();
    return request<{ gems: GemDto[] }>(`/inventory/gems${suffix ? `?${suffix}` : ''}`);
  },

  stickers: () => request<{ stickers: StickerDto[] }>('/inventory/stickers'),

  fieldToday: () => request<{ drops: FieldDropDto[] }>('/field/today'),

  recipes: () =>
    request<{
      recipes: Array<{
        id: string;
        slug: string;
        nameKo: string;
        ingredientCodes: string[];
        resultTier: number;
        unlockedBy: string | null;
      }>;
    }>('/crafting/recipes'),

  combine: (ingredientIds: string[]) =>
    request<{
      gem: GemDto;
      recipeSlug: string | null;
      kind: 'homogeneous' | 'recipe';
    }>('/crafting/combine', { method: 'POST', json: { ingredientIds } }),

  events: (events: Array<{ eventType: string; props?: Record<string, unknown> }>) =>
    request<{ ok: boolean; count: number }>('/events', { method: 'POST', json: { events } }),
};
