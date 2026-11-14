import { callApi } from '@app/utils/api';
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

function emailResult(
  status: EmailStatus | null,
  error: string | null = null,
  needsEmail = false,
): EmailVerificationResult {
  return { canProceed: !error && !needsEmail, needsEmail, status, error };
}

export async function checkEmailStatus(options?: {
  validate?: boolean;
}): Promise<EmailVerificationResult> {
  try {
    const validateParam = options?.validate ? '&validate=true' : '';
    const status: EmailStatus = await (await callApi(`/user/email/status?${validateParam}`)).json();

    if (!status.hasEmail) {
      return emailResult(status, null, true);
    }

    if (
      status.status === EmailValidationStatus.RISKY_EMAIL ||
      status.status === EmailValidationStatus.DISPOSABLE_EMAIL
    ) {
      return emailResult(status, 'Please use a valid work email.');
    }

    if (status.status === EmailValidationStatus.EXCEEDED_LIMIT) {
      return emailResult(
        status,
        'You have exceeded the maximum cloud inference limit. Please contact inquiries@promptfoo.dev to upgrade your account.',
      );
    }

    if (status.status === EmailValidationStatus.EMAIL_VERIFICATION_REQUIRED) {
      return emailResult(
        status,
        status.message ||
          'Your email address is not verified. Check your inbox for a verification link, then try again.',
      );
    }

    return emailResult(status);
  } catch (error) {
    console.error('Error checking email status:', error);
    return emailResult(null, 'Failed to check email verification status. Please try again.');
  }
}

export async function saveEmail(email: string): Promise<{ error?: string }> {
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
      return { error: (await emailResponse.json()).error || 'Failed to set email' };
    }

    return {};
  } catch (error) {
    console.error('Error setting email:', error);
    return { error: `Failed to set email: ${error}` };
  }
}

export async function clearEmail(): Promise<{ error?: string }> {
  try {
    const emailResponse = await callApi('/user/email/clear', {
      method: 'PUT',
    });

    if (!emailResponse.ok) {
      return { error: (await emailResponse.json()).error || 'Failed to clear email' };
    }

    return {};
  } catch (error) {
    console.error('Error clearing email:', error);
    return { error: `Failed to clear email: ${error}` };
  }
}
