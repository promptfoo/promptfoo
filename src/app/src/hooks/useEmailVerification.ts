import { useCallback, useState } from 'react';

import { callApiResult } from '@app/utils/api';
import { ApiRoutes } from '@promptfoo/types/api/routes';
import { UserSchemas } from '@promptfoo/types/api/user';
import { EmailValidationStatus, UserEmailStatus } from '../../../types/email';

interface EmailStatus {
  hasEmail: boolean;
  email?: string;
  status: UserEmailStatus;
  message?: string;
}

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
        const query = options?.validate ? new URLSearchParams({ validate: 'true' }) : undefined;
        const response = await callApiResult(
          ApiRoutes.User.EmailStatus,
          UserSchemas.EmailStatus.Response,
          { query },
        );
        if (!response.ok) {
          throw response.error;
        }
        const status: EmailStatus = response.data;

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

        if (status.status === EmailValidationStatus.EMAIL_VERIFICATION_REQUIRED) {
          return {
            canProceed: false,
            needsEmail: false,
            status,
            error:
              status.message ||
              'Your email address is not verified. Check your inbox for a verification link, then try again.',
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
      // First set the email
      const emailResponse = await callApiResult(
        ApiRoutes.User.Update,
        UserSchemas.Update.Response,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        },
      );

      if (!emailResponse.ok) {
        return { error: emailResponse.error.message || 'Failed to set email' };
      }

      return {};
    } catch (error) {
      console.error('Error setting email:', error);
      return { error: `Failed to set email: ${error}` };
    }
  }, []);

  const clearEmail = useCallback(async (): Promise<{ error?: string }> => {
    try {
      const emailResponse = await callApiResult(
        ApiRoutes.User.ClearEmail,
        UserSchemas.ClearEmail.Response,
        {
          method: 'PUT',
        },
      );

      if (!emailResponse.ok) {
        return { error: emailResponse.error.message || 'Failed to clear email' };
      }

      return {};
    } catch (error) {
      console.error('Error clearing email:', error);
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
