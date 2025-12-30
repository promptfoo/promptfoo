import useApiConfig from '@app/stores/apiConfig';
import { callApi, fetchUserEmail } from '@app/utils/api';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { useEmailVerification } from './useEmailVerification';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

describe('useEmailVerification', () => {
  const setupApiMock = (response: any, isSuccess = true) => {
    if (isSuccess) {
      (callApi as Mock).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(response),
      });
    } else {
      (callApi as Mock).mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue(response),
      });
    }
  };

  const setupApiError = (error: Error) => {
    (callApi as Mock).mockRejectedValue(error);
  };

  const callCheckEmailStatus = async (hook: any) => {
    let result;
    await act(async () => {
      result = await hook.current.checkEmailStatus();
    });
    return result;
  };

  const callSaveEmail = async (hook: any, email: string) => {
    let result;
    await act(async () => {
      result = await hook.current.saveEmail(email);
    });
    return result;
  };

  const callClearEmail = async (hook: any) => {
    let result;
    await act(async () => {
      result = await hook.current.clearEmail();
    });
    return result;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkEmailStatus', () => {
    it.each([
      {
        name: 'hasEmail: true and status: "ok"',
        apiResponse: {
          hasEmail: true,
          status: 'ok' as const,
          email: 'user@example.com',
        },
        expected: {
          canProceed: true,
          needsEmail: false,
          error: null,
        },
      },
      {
        name: 'status: "exceeded_limit"',
        apiResponse: {
          hasEmail: true,
          status: 'exceeded_limit' as const,
          message: 'You have exceeded the maximum cloud inference limit.',
        },
        expected: {
          canProceed: false,
          needsEmail: false,
          error:
            'You have exceeded the maximum cloud inference limit. Please contact inquiries@promptfoo.dev to upgrade your account.',
        },
      },
      {
        name: 'hasEmail: false',
        apiResponse: {
          hasEmail: false,
          status: 'no_email' as const,
        },
        expected: {
          canProceed: false,
          needsEmail: true,
          error: null,
        },
      },
      {
        name: 'status: "show_usage_warning"',
        apiResponse: {
          hasEmail: true,
          status: 'show_usage_warning' as const,
          message: 'This is a usage warning message.',
          email: 'user@example.com',
        },
        expected: {
          canProceed: true,
          needsEmail: false,
          error: null,
        },
      },
    ])('should handle $name correctly', async ({ apiResponse, expected }) => {
      setupApiMock(apiResponse);
      const { result } = renderHook(() => useEmailVerification());

      const emailResult = await callCheckEmailStatus(result);

      expect(callApi).toHaveBeenCalledWith(expect.stringContaining('/user/email/status'));
      expect(emailResult).toEqual({
        ...expected,
        status: apiResponse,
      });
    });

    it('should set isChecking to true while checkEmailStatus is in progress and set it back to false after completion', async () => {
      const mockApiStatus = {
        hasEmail: true,
        status: 'ok' as const,
        email: 'user@example.com',
      };

      setupApiMock(mockApiStatus);
      const { result } = renderHook(() => useEmailVerification());

      expect(result.current.isChecking).toBe(false);

      let promise: Promise<any> | undefined;
      act(() => {
        promise = result.current.checkEmailStatus();
      });

      expect(result.current.isChecking).toBe(true);

      await act(async () => {
        await promise;
      });

      expect(result.current.isChecking).toBe(false);
    });

    it('should return canProceed: false, needsEmail: false, status: null, and an error message when the API call fails', async () => {
      setupApiError(new Error('Network error'));
      const { result } = renderHook(() => useEmailVerification());

      const emailResult = await callCheckEmailStatus(result);

      expect(callApi).toHaveBeenCalledWith(expect.stringContaining('/user/email/status'));
      expect(emailResult).toEqual({
        canProceed: false,
        needsEmail: false,
        status: null,
        error: 'Failed to check email verification status. Please try again.',
      });
    });
  });

  describe('saveEmail', () => {
    it('should return an empty object when the API call to /user/email returns ok: true', async () => {
      setupApiMock({}, true);
      const { result } = renderHook(() => useEmailVerification());

      const saveEmailResult = await callSaveEmail(result, 'test@example.com');

      expect(callApi).toHaveBeenCalledWith('/user/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      });
      expect(saveEmailResult).toEqual({});
    });

    it.each([
      {
        name: 'structured error information',
        apiResponse: { error: 'Invalid email format' },
        expectedError: 'Invalid email format',
      },
      {
        name: 'error message in response body',
        apiResponse: { error: 'Email already in use' },
        expectedError: 'Email already in use',
      },
    ])('should return an error object with $name', async ({ apiResponse, expectedError }) => {
      setupApiMock(apiResponse, false);
      const { result } = renderHook(() => useEmailVerification());

      const saveEmailResult = await callSaveEmail(result, 'test@example.com');

      expect(callApi).toHaveBeenCalledWith('/user/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      });
      expect(saveEmailResult).toEqual({ error: expectedError });
    });

    it('should return an error object when callApi throws an exception', async () => {
      const mockError = new Error('Network error');
      setupApiError(mockError);
      const { result } = renderHook(() => useEmailVerification());

      const saveEmailResult = await callSaveEmail(result, 'test@example.com');

      expect(saveEmailResult).toEqual({ error: `Failed to set email: ${mockError}` });
    });
  });

  describe('clearEmail', () => {
    it('should return an empty object when the API call to /user/email/clear returns ok: true', async () => {
      setupApiMock({}, true);
      const { result } = renderHook(() => useEmailVerification());

      const clearEmailResult = await callClearEmail(result);

      expect(callApi).toHaveBeenCalledWith('/user/email/clear', {
        method: 'PUT',
      });
      expect(clearEmailResult).toEqual({});
    });

    it('should return an error object when the API call returns ok: false', async () => {
      const apiResponse = { error: 'Failed to clear email from database' };
      setupApiMock(apiResponse, false);
      const { result } = renderHook(() => useEmailVerification());

      const clearEmailResult = await callClearEmail(result);

      expect(callApi).toHaveBeenCalledWith('/user/email/clear', {
        method: 'PUT',
      });
      expect(clearEmailResult).toEqual({ error: 'Failed to clear email from database' });
    });

    it('should return a default error message when the API call returns ok: false with no error message', async () => {
      setupApiMock({}, false);
      const { result } = renderHook(() => useEmailVerification());

      const clearEmailResult = await callClearEmail(result);

      expect(clearEmailResult).toEqual({ error: 'Failed to clear email' });
    });

    it('should return an error object when callApi throws an exception', async () => {
      const mockError = new Error('Network error');
      setupApiError(mockError);
      const { result } = renderHook(() => useEmailVerification());

      const clearEmailResult = await callClearEmail(result);

      expect(clearEmailResult).toEqual({ error: `Failed to clear email: ${mockError}` });
    });
  });
});

describe('fetchUserEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when apiBaseUrl is missing or invalid', async () => {
    (fetchUserEmail as Mock).mockImplementationOnce(async () => null);

    const mockGetState = vi.fn(() => ({
      apiBaseUrl: undefined,
      setApiBaseUrl: vi.fn(),
      fetchingPromise: null,
      setFetchingPromise: vi.fn(),
      persistApiBaseUrl: false,
      enablePersistApiBaseUrl: vi.fn(),
    }));
    vi.spyOn(useApiConfig, 'getState').mockImplementation(mockGetState);

    const email = await fetchUserEmail();
    expect(email).toBe(null);
  });
});
