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
}

export const useUserStore = create<UserState>((set, getState) => ({
  email: null,
  userId: null,
  isLoading: true,
  setEmail: (email: string) => set({ email }),
  setUserId: (userId: string) => set({ userId }),
  fetchEmail: async () => {
    if (getState().email) {
      return;
    }
    try {
      const response = await callApi('/user/email');
      if (response.ok) {
        const data = await response.json();
        set({ email: data.email, isLoading: false });
      } else if (response.status === 404) {
        set({ email: null, isLoading: false });
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
      set({ userId });
    } catch (error) {
      console.error('Error fetching user ID:', error);
      set({ userId: null });
    }
  },
}));
