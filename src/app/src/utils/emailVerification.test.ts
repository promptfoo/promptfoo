import { mockCallApiResponse, rejectCallApi, resetCallApiMock } from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkEmailStatus, clearEmail, saveEmail } from './emailVerification';

const createAllowedEmailExpectation = () => ({
  canProceed: true,
  needsEmail: false,
  error: null,
});

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

describe('emailVerification', () => {
  const setupApiMock = (response: any, isSuccess = true) => {
    mockCallApiResponse(response, { ok: isSuccess });
  };

  const setupApiError = (error: Error) => {
    rejectCallApi(error);
  };

  beforeEach(() => {
    resetCallApiMock();
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
        expected: createAllowedEmailExpectation(),
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
        name: 'status: "email_verification_required"',
        apiResponse: {
          hasEmail: true,
          status: 'email_verification_required' as const,
          message: 'Please verify your email address and try again.',
        },
        expected: {
          canProceed: false,
          needsEmail: false,
          error: 'Please verify your email address and try again.',
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
        expected: createAllowedEmailExpectation(),
      },
    ])('should handle $name correctly', async ({ apiResponse, expected }) => {
      setupApiMock(apiResponse);

      const emailResult = await checkEmailStatus();

      expect(callApi).toHaveBeenCalledWith(expect.stringContaining('/user/email/status'));
      expect(emailResult).toEqual({
        ...expected,
        status: apiResponse,
      });
    });

    it('should return canProceed: false, needsEmail: false, status: null, and an error message when the API call fails', async () => {
      setupApiError(new Error('Network error'));

      const emailResult = await checkEmailStatus();

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

      const saveEmailResult = await saveEmail('test@example.com');

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

      const saveEmailResult = await saveEmail('test@example.com');

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

      const saveEmailResult = await saveEmail('test@example.com');

      expect(saveEmailResult).toEqual({ error: `Failed to set email: ${mockError}` });
    });
  });

  describe('clearEmail', () => {
    it('should return an empty object when the API call to /user/email/clear returns ok: true', async () => {
      setupApiMock({}, true);

      const clearEmailResult = await clearEmail();

      expect(callApi).toHaveBeenCalledWith('/user/email/clear', {
        method: 'PUT',
      });
      expect(clearEmailResult).toEqual({});
    });

    it('should return an error object when the API call returns ok: false', async () => {
      const apiResponse = { error: 'Failed to clear email from database' };
      setupApiMock(apiResponse, false);

      const clearEmailResult = await clearEmail();

      expect(callApi).toHaveBeenCalledWith('/user/email/clear', {
        method: 'PUT',
      });
      expect(clearEmailResult).toEqual({ error: 'Failed to clear email from database' });
    });

    it('should return a default error message when the API call returns ok: false with no error message', async () => {
      setupApiMock({}, false);

      const clearEmailResult = await clearEmail();

      expect(clearEmailResult).toEqual({ error: 'Failed to clear email' });
    });

    it('should return an error object when callApi throws an exception', async () => {
      const mockError = new Error('Network error');
      setupApiError(mockError);

      const clearEmailResult = await clearEmail();

      expect(clearEmailResult).toEqual({ error: `Failed to clear email: ${mockError}` });
    });
  });
});
