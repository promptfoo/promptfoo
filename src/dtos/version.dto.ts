/**
 * Version API DTOs.
 *
 * These schemas define the request/response shapes for version-related endpoints.
 */
import { z } from 'zod';

// =============================================================================
// GET /api/version
// =============================================================================

/**
 * Update commands returned by the version endpoint.
 * Matches the UpdateCommandResult interface from src/updates/updateCommands.ts
 */
export const UpdateCommandsSchema = z.object({
  primary: z.string(),
  alternative: z.string().nullable(),
  commandType: z.enum(['docker', 'npx', 'npm']),
});
export type UpdateCommands = z.infer<typeof UpdateCommandsSchema>;

/**
 * Command type enum - shared between UpdateCommandsSchema and response.
 * Note: 'docker' is used for self-hosted deployments.
 */
export const CommandTypeSchema = z.enum(['docker', 'npx', 'npm']);
export type CommandType = z.infer<typeof CommandTypeSchema>;

/**
 * Response for GET /api/version
 *
 * Note: commandType appears both in updateCommands and at the top level.
 * The top-level commandType provides convenient access without needing to
 * access the nested updateCommands object. Both values are always identical.
 */
export const GetVersionResponseSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  selfHosted: z.boolean(),
  isNpx: z.boolean(),
  updateCommands: UpdateCommandsSchema,
  /** Convenience field - same value as updateCommands.commandType */
  commandType: CommandTypeSchema,
});
export type GetVersionResponse = z.infer<typeof GetVersionResponseSchema>;

/**
 * Error response for GET /api/version (includes fallback data)
 */
export const GetVersionErrorResponseSchema = z.object({
  error: z.string(),
  currentVersion: z.string(),
  latestVersion: z.string(),
  updateAvailable: z.boolean(),
  selfHosted: z.boolean(),
  isNpx: z.boolean(),
  updateCommands: UpdateCommandsSchema,
  commandType: CommandTypeSchema,
});
export type GetVersionErrorResponse = z.infer<typeof GetVersionErrorResponseSchema>;

// =============================================================================
// GET /api/remote-health
// =============================================================================

/**
 * Response for GET /api/remote-health
 * Returns the health status of the connection to Promptfoo Cloud.
 */
export const GetRemoteHealthResponseSchema = z.object({
  status: z.string(),
  message: z.string(),
});
export type GetRemoteHealthResponse = z.infer<typeof GetRemoteHealthResponseSchema>;
