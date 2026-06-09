import { ApiRoutes, callApiJson, callApiResult, fetchUserId, UserSchemas } from '@app/utils/api';
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
      const data = await callApiJson(ApiRoutes.User.Get, UserSchemas.Get.Response, {
        cache: 'no-store',
      });
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
      const userId = await fetchUserId();
      set({ userId: userId || null });
    } catch (error) {
      console.error('Error fetching user ID:', error);
      set({ userId: null });
    }
  },
  logout: async () => {
    try {
      const response = await callApiResult(ApiRoutes.User.Logout, UserSchemas.Logout.Response, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Logout failed');
      }
      set({ email: null, userId: null, isLoading: false });
    } catch (error) {
      console.error('Error during logout:', error);
      // Clear local state even if API call fails
      set({ email: null, userId: null, isLoading: false });
    }
  },
  clearUser: () => set({ email: null, userId: null, isLoading: false }),
}));
