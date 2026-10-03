import { callApi, fetchUserId } from '@app/utils/api';
import { create } from 'zustand';

interface UserState {
  email: string | null;
  userId: string | null;
  isLoading: boolean;
  authVersion: number;
  setEmail: (email: string) => void;
  fetchEmail: () => Promise<void>;
  fetchUserId: () => Promise<void>;
  logout: () => Promise<void>;
  clearUser: () => void;
}

export const useUserStore = create<UserState>((set, getState) => ({
  email: null,
  userId: null,
  isLoading: true,
  authVersion: 0,
  // The same email can authenticate with different cloud credentials or organizations.
  setEmail: (email: string) => set((state) => ({ email, authVersion: state.authVersion + 1 })),
  fetchEmail: async () => {
    if (getState().email) {
      set({ isLoading: false });
      return;
    }
    try {
      const response = await callApi('/user/email', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch user email');
      }
      set({ email: (await response.json()).email, isLoading: false });
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
      set({ userId: (await fetchUserId()) || null });
    } catch (error) {
      console.error('Error fetching user ID:', error);
      set({ userId: null });
    }
  },
  logout: async () => {
    try {
      const response = await callApi('/user/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Logout failed');
      }
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      // Clear local state even if logout fails.
      getState().clearUser();
    }
  },
  clearUser: () =>
    set((state) => ({
      email: null,
      userId: null,
      isLoading: false,
      authVersion: state.authVersion + 1,
    })),
}));
