import { useEffect } from 'react';
import { callApi } from '@app/utils/api';
import { create } from 'zustand';

interface UserState {
  email: string | null;
  isLoading: boolean;
  setEmail: (email: string) => void;
  clearEmail: () => void;
  fetchEmail: () => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  email: null,
  isLoading: true,
  setEmail: (email: string) => set({ email }),
  clearEmail: () => set({ email: null }),
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

// Custom hook to periodically check authentication status
export function useAuthRefresh(intervalMs = 30000) {
  const { fetchEmail } = useUserStore();

  useEffect(() => {
    // Fetch immediately on component mount
    fetchEmail();

    // Set up interval to check periodically
    const interval = setInterval(() => {
      fetchEmail();
    }, intervalMs);

    // Clean up interval on unmount
    return () => clearInterval(interval);
  }, [fetchEmail, intervalMs]);
}
