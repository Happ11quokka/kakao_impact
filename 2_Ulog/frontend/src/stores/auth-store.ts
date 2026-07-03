// === Auth Store (쿠키 기반 세션) ===
import { create } from 'zustand';
import { api, ApiError } from '../lib/api';

export interface User {
  id: string;
  kakaoId: number;
  nickname: string;
  profileUrl: string | null;
}

export interface Tickets {
  date: string;
  remaining: number;
}

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: User | null;
  tickets: Tickets | null;
  status: AuthStatus;
  fetchMe: () => Promise<User | null>;
  logout: () => Promise<void>;
  loginUrl: () => string;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tickets: null,
  status: 'idle',

  fetchMe: async () => {
    set({ status: 'loading' });
    try {
      const { user, tickets } = await api.me();
      set({ user, tickets, status: 'authenticated' });
      return user;
    } catch (err) {
      const isUnauth = err instanceof ApiError && err.status === 401;
      set({ user: null, tickets: null, status: isUnauth ? 'unauthenticated' : 'idle' });
      return null;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      /* 서버 호출 실패해도 로컬 상태는 비움 */
    }
    api.setToken(null);
    set({ user: null, tickets: null, status: 'unauthenticated' });
  },

  loginUrl: () => api.loginUrl(),
}));
