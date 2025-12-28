/**
 * Cloud API DTOs.
 *
 * These schemas define the response shapes for Promptfoo Cloud API calls.
 * Use these to validate responses from external cloud services.
 *
 * Usage:
 *   import { CloudUserSchema, CloudMeResponseSchema } from '@promptfoo/dtos';
 *
 *   const response = await fetch('https://api.promptfoo.app/api/v1/users/me');
 *   const data = CloudMeResponseSchema.parse(await response.json());
 */
import { z } from 'zod';

// =============================================================================
// Cloud User
// =============================================================================

/**
 * Cloud user object returned from API.
 */
export const CloudUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});
export type CloudUser = z.infer<typeof CloudUserSchema>;

// =============================================================================
// Cloud Organization
// =============================================================================

/**
 * Cloud organization object returned from API.
 */
export const CloudOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});
export type CloudOrganization = z.infer<typeof CloudOrganizationSchema>;

// =============================================================================
// Cloud Team
// =============================================================================

/**
 * Cloud team object returned from API.
 */
export const CloudTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  organizationId: z.string(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});
export type CloudTeam = z.infer<typeof CloudTeamSchema>;

// =============================================================================
// Cloud App
// =============================================================================

/**
 * Cloud app configuration.
 */
export const CloudAppSchema = z.object({
  url: z.string().url(),
});
export type CloudApp = z.infer<typeof CloudAppSchema>;

// =============================================================================
// /api/v1/users/me Response
// =============================================================================

/**
 * Response from GET /api/v1/users/me.
 */
export const CloudMeResponseSchema = z.object({
  user: CloudUserSchema,
  organization: CloudOrganizationSchema,
  app: CloudAppSchema,
});
export type CloudMeResponse = z.infer<typeof CloudMeResponseSchema>;

// =============================================================================
// Share API
// =============================================================================

/**
 * Response from share endpoint.
 */
export const CloudShareResponseSchema = z.object({
  id: z.string(),
  url: z.string().url().optional(),
});
export type CloudShareResponse = z.infer<typeof CloudShareResponseSchema>;

// =============================================================================
// Version Check
// =============================================================================

/**
 * Response from /version endpoint.
 */
export const CloudVersionResponseSchema = z.object({
  latestVersion: z.string().optional(),
  info: z
    .object({
      version: z.string(),
    })
    .optional(),
});
export type CloudVersionResponse = z.infer<typeof CloudVersionResponseSchema>;

// =============================================================================
// Health Check
// =============================================================================

/**
 * Response from /health endpoint.
 */
export const CloudHealthResponseSchema = z.object({
  status: z.enum(['ok', 'healthy', 'degraded', 'unhealthy']).optional(),
  version: z.string().optional(),
});
export type CloudHealthResponse = z.infer<typeof CloudHealthResponseSchema>;

// =============================================================================
// Remote Generation Task
// =============================================================================

/**
 * Request body for remote generation task.
 */
export const RemoteTaskRequestSchema = z.object({
  task: z.string(),
  data: z.record(z.unknown()),
});
export type RemoteTaskRequest = z.infer<typeof RemoteTaskRequestSchema>;

/**
 * Response from remote generation task.
 */
export const RemoteTaskResponseSchema = z.object({
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type RemoteTaskResponse = z.infer<typeof RemoteTaskResponseSchema>;

// =============================================================================
// Blob Upload
// =============================================================================

/**
 * Response from blob upload endpoint.
 */
export const BlobStoreResultSchema = z.object({
  hash: z.string(),
  url: z.string().url().optional(),
  uploaded: z.boolean().optional(),
});
export type BlobStoreResult = z.infer<typeof BlobStoreResultSchema>;

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Safely validates external API response data.
 * Returns the validated data or throws a descriptive error.
 *
 * @example
 * const data = await validateCloudResponse(
 *   await response.json(),
 *   CloudMeResponseSchema,
 *   'users/me'
 * );
 */
export function validateCloudResponse<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  endpoint: string,
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid response from cloud API ${endpoint}: ${issues}`);
  }
  return result.data;
}

/**
 * Safely validates external API response without throwing.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateCloudResponseSafe<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return { success: false, error: issues };
  }
  return { success: true, data: result.data };
}
