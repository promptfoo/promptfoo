import { z } from 'zod';
import { EmailSchema } from './common';

/** Email status values returned by the server. */
export const EmailStatusEnum = z.enum([
  'ok',
  'exceeded_limit',
  'show_usage_warning',
  'no_email',
  'risky_email',
  'disposable_email',
]);

export type EmailStatus = z.infer<typeof EmailStatusEnum>;

// GET /api/user/email

export const GetUserResponseSchema = z.object({
  email: EmailSchema.nullable(),
});

export type GetUserResponse = z.infer<typeof GetUserResponseSchema>;

// GET /api/user/id

export const GetUserIdResponseSchema = z.object({
  id: z.string(),
});

export type GetUserIdResponse = z.infer<typeof GetUserIdResponseSchema>;

// POST /api/user/email

export const UpdateUserRequestSchema = z.object({
  email: EmailSchema,
});

export const UpdateUserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type UpdateUserResponse = z.infer<typeof UpdateUserResponseSchema>;

// GET /api/user/email-status

export const GetEmailStatusResponseSchema = z.object({
  hasEmail: z.boolean(),
  email: EmailSchema.optional(),
  status: EmailStatusEnum,
  message: z.string().optional(),
});

export type GetEmailStatusResponse = z.infer<typeof GetEmailStatusResponseSchema>;

/** Grouped schemas for server-side validation. */
export const UserSchemas = {
  Get: {
    Response: GetUserResponseSchema,
  },
  GetId: {
    Response: GetUserIdResponseSchema,
  },
  Update: {
    Request: UpdateUserRequestSchema,
    Response: UpdateUserResponseSchema,
  },
  EmailStatus: {
    Response: GetEmailStatusResponseSchema,
  },
} as const;
