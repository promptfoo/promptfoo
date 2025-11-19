export const EMAIL_OK_STATUS = 'ok';
export type EmailOkStatus = typeof EMAIL_OK_STATUS;
export const BAD_EMAIL_RESULT = 'bad_email';
export type BadEmailResult = typeof BAD_EMAIL_RESULT;

export enum EmailValidationStatus {
  OK = EMAIL_OK_STATUS,
  EXCEEDED_LIMIT = 'exceeded_limit',
  SHOW_USAGE_WARNING = 'show_usage_warning',
  RISKY_EMAIL = 'risky_email',
  DISPOSABLE_EMAIL = 'disposable_email',
}

export const NO_EMAIL_STATUS = 'no_email';
export type NoEmailStatus = typeof NO_EMAIL_STATUS;

export type UserEmailStatus = EmailValidationStatus | NoEmailStatus;
