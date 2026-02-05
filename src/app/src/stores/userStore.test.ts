import { callApi, fetchUserId } from '@app/utils/api';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useUserStore } from './userStore';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

const mockedCallApi = callApi as Mock;
const mockedFetchUserId = fetchUserId as Mock;

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
    expect(mockedCallApi).toHaveBeenCalledWith('/user/email', { cache: 'no-store' });
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
        name: 'non-200 status code (e.g. 500)',
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
      useUserStore.setState({ email: initialEmail });
      expect(useUserStore.getState().email).toBe(initialEmail);

      await act(async () => {
        await useUserStore.getState().fetchEmail();
      });

      expect(mockedCallApi).not.toHaveBeenCalled();
      expect(useUserStore.getState().email).toBe(initialEmail);
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

    it('should not make an API call if userId is already present in the state', async () => {
      const existingUserId = 'some-user-id';
      useUserStore.setState({ userId: existingUserId });

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
  });
});
