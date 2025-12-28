import { useCallback, useState } from 'react';

import { ApiRequestError, callApiTyped } from '@app/utils/apiClient';
import { EmailValidationStatus } from '@promptfoo/types/email';
import type {
  ClearUserEmailResponse,
  GetEmailStatusResponse,
  UpdateUserEmailRequest,
  UpdateUserEmailResponse,
} from '@promptfoo/dtos';

/**
 * Email status response from the API.
 * Re-exported from shared DTOs for convenience.
 */
export type EmailStatus = GetEmailStatusResponse;

interface EmailVerificationResult {
  canProceed: boolean;
  needsEmail: boolean;
  status: EmailStatus | null;
  error: string | null;
}

export function useEmailVerification() {
  const [isChecking, setIsChecking] = useState(false);

  const checkEmailStatus = useCallback(
    async (options?: { validate?: boolean }): Promise<EmailVerificationResult> => {
      setIsChecking(true);
      try {
        const validateParam = options?.validate ? 'validate=true' : '';
        const status = await callApiTyped<EmailStatus>(`/user/email/status?${validateParam}`);

        if (!status.hasEmail) {
          return {
            canProceed: false,
            needsEmail: true,
            status,
            error: null,
          };
        }

        if (
          status.status === EmailValidationStatus.RISKY_EMAIL ||
          status.status === EmailValidationStatus.DISPOSABLE_EMAIL
        ) {
          return {
            canProceed: false,
            needsEmail: false,
            status,
            error: 'Please use a valid work email.',
          };
        }

        if (status.status === EmailValidationStatus.EXCEEDED_LIMIT) {
          return {
            canProceed: false,
            needsEmail: false,
            status,
            error:
              'You have exceeded the maximum cloud inference limit. Please contact inquiries@promptfoo.dev to upgrade your account.',
          };
        }

        return {
          canProceed: true,
          needsEmail: false,
          status,
          error: null,
        };
      } catch (error) {
        console.error('Error checking email status:', error);
        return {
          canProceed: false,
          needsEmail: false,
          status: null,
          error: 'Failed to check email verification status. Please try again.',
        };
      } finally {
        setIsChecking(false);
      }
    },
    [],
  );

  const saveEmail = useCallback(async (email: string): Promise<{ error?: string }> => {
    try {
      const body: UpdateUserEmailRequest = { email };
      await callApiTyped<UpdateUserEmailResponse>('/user/email', {
        method: 'POST',
        body,
      });
      return {};
    } catch (error) {
      console.error('Error setting email:', error);
      if (error instanceof ApiRequestError && error.body) {
        try {
          const errorData = JSON.parse(error.body);
          return { error: errorData.error || 'Failed to set email' };
        } catch {
          // Failed to parse error body
        }
      }
      return { error: `Failed to set email: ${error}` };
    }
  }, []);

  const clearEmail = useCallback(async (): Promise<{ error?: string }> => {
    try {
      await callApiTyped<ClearUserEmailResponse>('/user/email/clear', {
        method: 'PUT',
      });
      return {};
    } catch (error) {
      console.error('Error clearing email:', error);
      if (error instanceof ApiRequestError && error.body) {
        try {
          const errorData = JSON.parse(error.body);
          return { error: errorData.error || 'Failed to clear email' };
        } catch {
          // Failed to parse error body
        }
      }
      return { error: `Failed to clear email: ${error}` };
    }
  }, []);

  return {
    checkEmailStatus,
    saveEmail,
    clearEmail,
    isChecking,
  };
}
