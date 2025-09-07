import { act } from '@testing-library/react';
import { callApi, fetchUserId } from '@app/utils/api';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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
    expect(mockedCallApi).toHaveBeenCalledWith('/user/email');
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
      expect(useUserStore.getState().userId).toBeNull();
      const testUserId = 'test-user-id';
      mockedFetchUserId.mockResolvedValue(testUserId);

      await act(async () => {
        await useUserStore.getState().fetchUserId();
      });

      expect(useUserStore.getState().userId).toBe(testUserId);
    });

    it('should not make an API call if userId is already present in the state', async () => {
      const existingUserId = 'some-user-id';
      useUserStore.setState({ userId: existingUserId });

      await act(async () => {
        await useUserStore.getState().fetchUserId();
      });

      expect(mockedFetchUserId).not.toHaveBeenCalled();
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

      expect(useUserStore.getState().userId).toBeNull();

      act(() => {
        useUserStore.getState().setUserId(testUserId);
      });

      expect(useUserStore.getState().userId).toBe(testUserId);
    });
  });
});
