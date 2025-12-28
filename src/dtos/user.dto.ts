/**
 * User API DTOs.
 *
 * These schemas define the request/response shapes for user-related endpoints.
 * They match the CURRENT behavior of the API exactly.
 */
import { z } from 'zod';
import { EmailSchema, SuccessMessageResponseSchema } from './common';

// =============================================================================
// GET /api/user/email
// =============================================================================

/**
 * Response for GET /api/user/email
 * Returns the user's email or null if not configured.
 */
export const GetUserEmailResponseSchema = z.object({
  email: EmailSchema.nullable(),
});
export type GetUserEmailResponse = z.infer<typeof GetUserEmailResponseSchema>;

// =============================================================================
// GET /api/user/id
// =============================================================================

/**
 * Response for GET /api/user/id
 * Returns the user's unique identifier.
 */
export const GetUserIdResponseSchema = z.object({
  id: z.string(),
});
export type GetUserIdResponse = z.infer<typeof GetUserIdResponseSchema>;

// =============================================================================
// POST /api/user/email
// =============================================================================

/**
 * Request body for POST /api/user/email
 */
export const UpdateUserEmailRequestSchema = z.object({
  email: EmailSchema,
});
export type UpdateUserEmailRequest = z.infer<typeof UpdateUserEmailRequestSchema>;

/**
 * Response for POST /api/user/email
 */
export const UpdateUserEmailResponseSchema = SuccessMessageResponseSchema;
export type UpdateUserEmailResponse = z.infer<typeof UpdateUserEmailResponseSchema>;

// =============================================================================
// PUT /api/user/email/clear
// =============================================================================

/**
 * Response for PUT /api/user/email/clear
 */
export const ClearUserEmailResponseSchema = SuccessMessageResponseSchema;
export type ClearUserEmailResponse = z.infer<typeof ClearUserEmailResponseSchema>;

// =============================================================================
// GET /api/user/email/status
// =============================================================================

/**
 * Query parameters for GET /api/user/email/status
 */
export const GetEmailStatusQuerySchema = z.object({
  validate: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});
export type GetEmailStatusQuery = z.infer<typeof GetEmailStatusQuerySchema>;

/**
 * Email status values.
 */
export const EmailStatusValueSchema = z.enum([
  'ok',
  'exceeded_limit',
  'show_usage_warning',
  'no_email',
  'risky_email',
  'disposable_email',
]);
export type EmailStatusValue = z.infer<typeof EmailStatusValueSchema>;

/**
 * Response for GET /api/user/email/status
 */
export const GetEmailStatusResponseSchema = z.object({
  hasEmail: z.boolean(),
  email: EmailSchema.optional(),
  status: EmailStatusValueSchema,
  message: z.string().optional(),
});
export type GetEmailStatusResponse = z.infer<typeof GetEmailStatusResponseSchema>;

// =============================================================================
// POST /api/user/login
// =============================================================================

/**
 * Request body for POST /api/user/login
 */
export const LoginRequestSchema = z.object({
  apiKey: z.string().min(1, 'API key is required').max(512, 'API key too long'),
  apiHost: z.string().url().optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * Response for POST /api/user/login
 */
export const LoginResponseSchema = z.object({
  success: z.literal(true),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  organization: z.object({
    id: z.string(),
    name: z.string(),
  }),
  app: z.object({
    url: z.string(),
  }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// =============================================================================
// POST /api/user/logout
// =============================================================================

/**
 * Response for POST /api/user/logout
 */
export const LogoutResponseSchema = SuccessMessageResponseSchema;
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

// =============================================================================
// GET /api/user/cloud-config
// =============================================================================

/**
 * Response for GET /api/user/cloud-config
 */
export const GetCloudConfigResponseSchema = z.object({
  appUrl: z.string().optional(),
  isEnabled: z.boolean(),
});
export type GetCloudConfigResponse = z.infer<typeof GetCloudConfigResponseSchema>;
