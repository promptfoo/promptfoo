import { useState, useCallback } from 'react';
import { callApi } from '@app/utils/api';

interface EmailStatus {
  hasEmail: boolean;
  email?: string;
  status: 'ok' | 'exceeded_limit' | 'show_usage_warning' | 'no_email';
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

  const checkEmailStatus = useCallback(async (): Promise<EmailVerificationResult> => {
    setIsChecking(true);
    try {
      const response = await callApi('/user/email/status');
      const status: EmailStatus = await response.json();

      if (!status.hasEmail) {
        return {
          canProceed: false,
          needsEmail: true,
          status,
          error: null,
        };
      }

      if (status.status === 'exceeded_limit') {
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
  }, []);

  const saveEmail = useCallback(async (email: string): Promise<{ error?: string }> => {
    try {
      // First set the email
      const emailResponse = await callApi('/user/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json();
        return { error: errorData.error || 'Failed to set email' };
      }

      return {};
    } catch (error) {
      console.error('Error setting email:', error);
      return { error: `Failed to set email: ${error}` };
    }
  }, []);

  return {
    checkEmailStatus,
    saveEmail,
    isChecking,
  };
}
