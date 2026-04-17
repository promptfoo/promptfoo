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

// POST /api/user/login

/** Request body for API key authentication. */
export const LoginRequestSchema = z.object({
  apiKey: z.string().min(1, 'API key is required').max(512, 'API key too long'),
  apiHost: z.url().optional(),
});

/** Response from successful login. */
export const LoginResponseSchema = z.object({
  success: z.literal(true),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: EmailSchema,
  }),
  organization: z.object({
    id: z.string(),
    name: z.string(),
  }),
  app: z.object({
    url: z.string(),
  }),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// POST /api/user/logout

/** Response from logout endpoint. */
export const LogoutResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

// GET /api/user/cloud-config

/** Response from cloud config endpoint. */
export const CloudConfigResponseSchema = z.object({
  appUrl: z.string(),
  isEnabled: z.boolean(),
});

export type CloudConfigResponse = z.infer<typeof CloudConfigResponseSchema>;

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
  Login: {
    Request: LoginRequestSchema,
    Response: LoginResponseSchema,
  },
  Logout: {
    Response: LogoutResponseSchema,
  },
  CloudConfig: {
    Response: CloudConfigResponseSchema,
  },
} as const;
