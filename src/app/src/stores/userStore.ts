import { callApiTyped } from '@app/utils/apiClient';
import { create } from 'zustand';
import type { GetUserEmailResponse, GetUserIdResponse, LogoutResponse } from '@promptfoo/dtos';

interface UserState {
  email: string | null;
  userId: string | null;
  isLoading: boolean;
  setEmail: (email: string) => void;
  setUserId: (userId: string) => void;
  fetchEmail: () => Promise<void>;
  fetchUserId: () => Promise<void>;
  logout: () => Promise<void>;
  clearUser: () => void;
}

export const useUserStore = create<UserState>((set, getState) => ({
  email: null,
  userId: null,
  isLoading: true,
  setEmail: (email: string) => set({ email }),
  setUserId: (userId: string) => set({ userId }),
  fetchEmail: async () => {
    if (getState().email) {
      set({ isLoading: false });
      return;
    }
    try {
      const data = await callApiTyped<GetUserEmailResponse>('/user/email', { cache: 'no-store' });
      set({ email: data.email, isLoading: false });
    } catch (error) {
      console.error('Error fetching user email:', error);
      set({ email: null, isLoading: false });
    }
  },
  fetchUserId: async () => {
    if (getState().userId) {
      return;
    }
    try {
      const data = await callApiTyped<GetUserIdResponse>('/user/id');
      set({ userId: data.id || null });
    } catch (error) {
      console.error('Error fetching user ID:', error);
      set({ userId: null });
    }
  },
  logout: async () => {
    try {
      await callApiTyped<LogoutResponse>('/user/logout', { method: 'POST' });
      set({ email: null, userId: null, isLoading: false });
    } catch (error) {
      console.error('Error during logout:', error);
      // Clear local state even if API call fails
      set({ email: null, userId: null, isLoading: false });
    }
  },
  clearUser: () => set({ email: null, userId: null, isLoading: false }),
}));
