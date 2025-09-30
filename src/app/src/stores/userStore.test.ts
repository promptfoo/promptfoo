import { act } from '@testing-library/react';
import { callApi, fetchUserId } from '@app/utils/api';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useUserStore } from './userStore';
import { useCloudConfigStore } from './cloudConfigStore';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

vi.mock('./cloudConfigStore', () => ({
  useCloudConfigStore: {
    getState: vi.fn().mockReturnValue({
      clearConfig: vi.fn(),
    }),
  },
}));

const mockedCallApi = callApi as Mock;
const mockedFetchUserId = fetchUserId as Mock;
const mockedUseCloudConfigStoreGetState = useCloudConfigStore.getState as Mock;

describe('useUserStore', () => {
  const initialState = useUserStore.getState();

  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState(initialState, true);
  });

  const verifyInitialState = () => {
    expect(useUserStore.getState().email).toBeNull();
    expect(useUserStore.getState().isLoading).toBe(true);
  };

  const verifyEmailApiCall = () => {
    expect(mockedCallApi).toHaveBeenCalledTimes(1);
    expect(mockedCallApi).toHaveBeenCalledWith('/user/email');
  };

  const verifyEmailState = (expectedEmail: string | null) => {
    expect(useUserStore.getState().email).toBe(expectedEmail);
  };

  const verifyUserIdState = (expectedUserId: string | null) => {
    expect(useUserStore.getState().userId).toBe(expectedUserId);
  };

  describe('fetchEmail', () => {
    it.each([
      {
        name: 'successful response with email',
        mockSetup: () => {
          const testEmail = 'user@example.com';
          mockedCallApi.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ email: testEmail }),
          });
          return { expectedEmail: testEmail };
        },
      },
      {
        name: '404 response',
        mockSetup: () => {
          mockedCallApi.mockResolvedValue({
            ok: false,
            status: 404,
          });
          return { expectedEmail: null };
        },
      },
      {
        name: 'status code other than 200 or 404',
        mockSetup: () => {
          mockedCallApi.mockResolvedValue({
            ok: false,
            status: 500,
          });
          return { expectedEmail: null };
        },
      },
      {
        name: 'successful response but with invalid JSON',
        mockSetup: () => {
          mockedCallApi.mockResolvedValue({
            ok: true,
            json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
          });
          return { expectedEmail: null };
        },
      },
      {
        name: 'non-404 error',
        mockSetup: () => {
          const errorMessage = 'Failed to fetch user email';
          mockedCallApi.mockRejectedValue(new Error(errorMessage));
          return { expectedEmail: null };
        },
      },
    ])('should handle $name correctly', async ({ mockSetup }) => {
      verifyInitialState();
      const { expectedEmail } = mockSetup();

      await act(async () => {
        await useUserStore.getState().fetchEmail();
      });

      const state = useUserStore.getState();
      expect(state.email).toBe(expectedEmail);
      expect(state.isLoading).toBe(false);
      verifyEmailApiCall();
    });

    it('should return early when email is already set', async () => {
      const initialEmail = 'existing@example.com';
      useUserStore.setState({ email: initialEmail, _emailFetched: true });
      expect(useUserStore.getState().email).toBe(initialEmail);

      await act(async () => {
        await useUserStore.getState().fetchEmail();
      });

      expect(mockedCallApi).not.toHaveBeenCalled();
      expect(useUserStore.getState().email).toBe(initialEmail);
    });

    it('should deduplicate concurrent fetchEmail calls', async () => {
      verifyInitialState();
      const testEmail = 'concurrent@example.com';
      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ email: testEmail }),
      });

      // Make multiple concurrent calls
      await act(async () => {
        await Promise.all([
          useUserStore.getState().fetchEmail(),
          useUserStore.getState().fetchEmail(),
          useUserStore.getState().fetchEmail(),
          useUserStore.getState().fetchEmail(),
        ]);
      });

      // API should only be called once, not four times
      expect(mockedCallApi).toHaveBeenCalledTimes(1);
      expect(useUserStore.getState().email).toBe(testEmail);
      expect(useUserStore.getState().isLoading).toBe(false);
    });

    it('should set _emailFetched to true after a failed fetchEmail call', async () => {
      verifyInitialState();
      mockedCallApi.mockRejectedValue(new Error('Failed to fetch user email'));

      await act(async () => {
        await useUserStore.getState().fetchEmail();
      });

      expect(useUserStore.getState()._emailFetched).toBe(true);
      expect(useUserStore.getState().email).toBe(null);
      expect(useUserStore.getState().isLoading).toBe(false);
      verifyEmailApiCall();

      await act(async () => {
        await useUserStore.getState().fetchEmail();
      });

      expect(mockedCallApi).toHaveBeenCalledTimes(1);
    });

    it('should clear _fetchEmailPromise after a failed API call', async () => {
      verifyInitialState();
      mockedCallApi.mockRejectedValue(new Error('API Error'));

      await act(async () => {
        await useUserStore.getState().fetchEmail();
      });

      expect(useUserStore.getState()._fetchEmailPromise).toBeNull();
      expect(useUserStore.getState().email).toBeNull();
      expect(useUserStore.getState().isLoading).toBe(false);
      verifyEmailApiCall();
    });
  });

  describe('fetchUserId', () => {
    it('should set userId when fetchUserId is called and fetchUserId resolves successfully', async () => {
      verifyUserIdState(null);
      const testUserId = 'test-user-id';
      mockedFetchUserId.mockResolvedValue(testUserId);

      await act(async () => {
        await useUserStore.getState().fetchUserId();
      });

      verifyUserIdState(testUserId);
    });

    it('should not make an API call if userId is already fetched', async () => {
      const existingUserId = 'some-user-id';
      useUserStore.setState({ userId: existingUserId, _userIdFetched: true });

      await act(async () => {
        await useUserStore.getState().fetchUserId();
      });

      expect(mockedFetchUserId).not.toHaveBeenCalled();
    });

    it('should set userId to null when fetchUserId resolves with an empty string', async () => {
      verifyUserIdState(null);
      mockedFetchUserId.mockResolvedValue('');

      await act(async () => {
        await useUserStore.getState().fetchUserId();
      });

      verifyUserIdState(null);
    });

    it('should deduplicate concurrent fetchUserId calls', async () => {
      verifyUserIdState(null);
      const testUserId = 'concurrent-user-id';
      mockedFetchUserId.mockResolvedValue(testUserId);

      // Make multiple concurrent calls
      await act(async () => {
        await Promise.all([
          useUserStore.getState().fetchUserId(),
          useUserStore.getState().fetchUserId(),
          useUserStore.getState().fetchUserId(),
          useUserStore.getState().fetchUserId(),
        ]);
      });

      // API should only be called once, not four times
      expect(mockedFetchUserId).toHaveBeenCalledTimes(1);
      expect(useUserStore.getState().userId).toBe(testUserId);
    });

    it('should update isLoading to false after fetchUserId completes when fetchEmail is already completed', async () => {
      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ email: 'test@example.com' }),
      });

      mockedFetchUserId.mockResolvedValue('test-user-id');

      expect(useUserStore.getState().isLoading).toBe(true);

      await act(async () => {
        await useUserStore.getState().fetchEmail();
      });

      expect(useUserStore.getState().isLoading).toBe(false);

      await act(async () => {
        await useUserStore.getState().fetchUserId();
      });

      expect(useUserStore.getState().isLoading).toBe(false);
    });
  });

  describe('setEmail', () => {
    it('should update the email state when setEmail is called with a valid email string', () => {
      const testEmail = 'test@example.com';

      act(() => {
        useUserStore.getState().setEmail(testEmail);
      });

      expect(useUserStore.getState().email).toBe(testEmail);
    });
  });

  describe('setUserId', () => {
    it('should update the userId state when setUserId is called with a valid userId string', () => {
      const testUserId = 'test-user-id';

      verifyUserIdState(null);

      act(() => {
        useUserStore.getState().setUserId(testUserId);
      });

      verifyUserIdState(testUserId);
    });
  });

  describe('logout', () => {
    it('should clear user state on successful logout', async () => {
      // Set initial state
      useUserStore.getState().setEmail('test@example.com');
      useUserStore.getState().setUserId('test-user-id');

      verifyEmailState('test@example.com');
      verifyUserIdState('test-user-id');

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      });

      await act(async () => {
        await useUserStore.getState().logout();
      });

      verifyEmailState(null);
      verifyUserIdState(null);
      expect(useUserStore.getState().isLoading).toBe(false);
    });

    it('should clear user state even on logout API failure', async () => {
      // Set initial state
      useUserStore.getState().setEmail('test@example.com');
      useUserStore.getState().setUserId('test-user-id');

      mockedCallApi.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await act(async () => {
        await useUserStore.getState().logout();
      });

      // Should still clear state even if API call fails
      verifyEmailState(null);
      verifyUserIdState(null);
      expect(useUserStore.getState().isLoading).toBe(false);
    });

    it('should clear user state on logout network error', async () => {
      // Set initial state
      useUserStore.getState().setEmail('test@example.com');

      mockedCallApi.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await useUserStore.getState().logout();
      });

      // Should clear state even on network error
      verifyEmailState(null);
      verifyUserIdState(null);
    });
  });

  describe('clearUser', () => {
    it('should immediately clear user state', () => {
      // Set initial state
      useUserStore.getState().setEmail('test@example.com');
      useUserStore.getState().setUserId('test-user-id');

      act(() => {
        useUserStore.getState().clearUser();
      });

      verifyEmailState(null);
      verifyUserIdState(null);
      expect(useUserStore.getState().isLoading).toBe(false);
    });

    it('should clear user state even if clearConfig throws an error', () => {
      useUserStore.setState({
        email: 'test@example.com',
        userId: 'test-user-id',
        isLoading: true,
        _emailFetched: true,
        _userIdFetched: true,
        _fetchEmailPromise: Promise.resolve(),
        _fetchUserIdPromise: Promise.resolve(),
      });

      mockedUseCloudConfigStoreGetState().clearConfig.mockImplementation(() => {
        throw new Error('clearConfig failed');
      });

      act(() => {
        try {
          useUserStore.getState().clearUser();
        } catch {}
      });

      const state = useUserStore.getState();
      expect(state.email).toBeNull();
      expect(state.userId).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state._emailFetched).toBe(false);
      expect(state._userIdFetched).toBe(false);
      expect(state._fetchEmailPromise).toBeNull();
      expect(state._fetchUserIdPromise).toBeNull();
    });
  });
});
