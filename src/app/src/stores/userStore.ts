import { callApi, fetchUserId } from '@app/utils/api';
import { create } from 'zustand';
import { useCloudConfigStore } from './cloudConfigStore';

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
  _fetchEmailPromise: Promise<void> | null;
  _fetchUserIdPromise: Promise<void> | null;
  _emailFetched: boolean;
  _userIdFetched: boolean;
}

export const useUserStore = create<UserState>((set, getState) => ({
  email: null,
  userId: null,
  isLoading: true,
  _fetchEmailPromise: null,
  _fetchUserIdPromise: null,
  _emailFetched: false,
  _userIdFetched: false,
  setEmail: (email: string) => set({ email, _emailFetched: true }),
  setUserId: (userId: string) => set({ userId, _userIdFetched: true }),
  fetchEmail: async () => {
    const state = getState();

    // If email has already been fetched, don't fetch again
    if (state._emailFetched) {
      set({ isLoading: false });
      return;
    }

    // If a fetch is already in progress, wait for it
    const existingPromise = state._fetchEmailPromise;
    if (existingPromise) {
      return existingPromise;
    }

    const fetchPromise = (async () => {
      try {
        const response = await callApi('/user/email');
        if (response.ok) {
          const data = await response.json();
          set({
            email: data.email,
            isLoading: false,
            _fetchEmailPromise: null,
            _emailFetched: true,
          });
        } else {
          // Handle 404 and other errors uniformly
          if (response.status !== 404) {
            console.error('Failed to fetch user email:', response.status);
          }
          set({ email: null, isLoading: false, _fetchEmailPromise: null, _emailFetched: true });
        }
      } catch (error) {
        console.error('Error fetching user email:', error);
        set({ email: null, isLoading: false, _fetchEmailPromise: null, _emailFetched: true });
      }
    })();

    set({ _fetchEmailPromise: fetchPromise });
    return fetchPromise;
  },
  fetchUserId: async () => {
    const state = getState();

    // If userId has already been fetched, don't fetch again
    if (state._userIdFetched) {
      return;
    }

    // If a fetch is already in progress, wait for it
    const existingPromise = state._fetchUserIdPromise;
    if (existingPromise) {
      return existingPromise;
    }

    const fetchPromise = (async () => {
      try {
        const userId = await fetchUserId();
        set({ userId: userId || null, _fetchUserIdPromise: null, _userIdFetched: true });
      } catch (error) {
        console.error('Error fetching user ID:', error);
        set({ userId: null, _fetchUserIdPromise: null, _userIdFetched: true });
      }
    })();

    set({ _fetchUserIdPromise: fetchPromise });
    return fetchPromise;
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
        set({
          email: null,
          userId: null,
          isLoading: false,
          _emailFetched: false,
          _userIdFetched: false,
          _fetchEmailPromise: null,
          _fetchUserIdPromise: null,
        });
        // Clear user-specific cloud config to prevent data leakage
        useCloudConfigStore.getState().clearConfig();
      } else {
        console.error('Logout failed');
        // Clear local state even if logout API call fails
        set({
          email: null,
          userId: null,
          isLoading: false,
          _emailFetched: false,
          _userIdFetched: false,
          _fetchEmailPromise: null,
          _fetchUserIdPromise: null,
        });
        // Clear cloud config even on failure
        useCloudConfigStore.getState().clearConfig();
      }
    } catch (error) {
      console.error('Error during logout:', error);
      // Clear local state even if API call fails
      set({
        email: null,
        userId: null,
        isLoading: false,
        _emailFetched: false,
        _userIdFetched: false,
        _fetchEmailPromise: null,
        _fetchUserIdPromise: null,
      });
      // Clear cloud config even on exception
      useCloudConfigStore.getState().clearConfig();
    }
  },
  clearUser: () => {
    set({
      email: null,
      userId: null,
      isLoading: false,
      _emailFetched: false,
      _userIdFetched: false,
      _fetchEmailPromise: null,
      _fetchUserIdPromise: null,
    });
    // Clear user-specific cloud config
    useCloudConfigStore.getState().clearConfig();
  },
}));
