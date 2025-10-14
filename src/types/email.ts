import { z } from 'zod';

export const EmailValidationStatusSchema = z.enum([
  'ok',
  'exceeded_limit',
  'show_usage_warning',
  'risky_email',
  'disposable_email',
]);

export const UserEmailStatusSchema = EmailValidationStatusSchema.or(z.enum(['no_email']));

export type EmailValidationStatus = z.infer<typeof EmailValidationStatusSchema>;

export type UserEmailStatus = z.infer<typeof UserEmailStatusSchema>;