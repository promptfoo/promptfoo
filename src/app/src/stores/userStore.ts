import { callApi, fetchUserId } from '@app/utils/api';
import { create } from 'zustand';

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
      const response = await callApi('/user/email', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        set({ email: data.email, isLoading: false });
      } else {
        throw new Error('Failed to fetch user email');
      }
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
      const userId = await fetchUserId();
      set({ userId: userId || null });
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

      if (response.ok) {
        set({ email: null, userId: null, isLoading: false });
      } else {
        console.error('Logout failed');
        // Clear local state even if logout API call fails
        set({ email: null, userId: null, isLoading: false });
      }
    } catch (error) {
      console.error('Error during logout:', error);
      // Clear local state even if API call fails
      set({ email: null, userId: null, isLoading: false });
    }
  },
  clearUser: () => set({ email: null, userId: null, isLoading: false }),
}));
