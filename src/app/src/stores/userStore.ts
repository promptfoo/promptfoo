import { callApi } from '@app/utils/api';
import { create } from 'zustand';

interface UserState {
  email: string | null;
  isLoading: boolean;
  setEmail: (email: string) => void;
  fetchEmail: () => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  email: null,
  isLoading: true,
  setEmail: (email: string) => set({ email }),
  fetchEmail: async () => {
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
}));
