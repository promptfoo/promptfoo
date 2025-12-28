/**
 * Configs API DTOs.
 *
 * These schemas define the request/response shapes for config-related endpoints.
 */
import { z } from 'zod';
import { TimestampsSchema } from './common';

// =============================================================================
// Common Config Types
// =============================================================================

/**
 * Config metadata returned in list responses.
 * Timestamps are Unix epoch milliseconds, normalized by the server.
 */
export const ConfigMetadataSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .merge(TimestampsSchema);
export type ConfigMetadata = z.infer<typeof ConfigMetadataSchema>;

/**
 * Config metadata with type (for unfiltered list).
 */
export const ConfigMetadataWithTypeSchema = ConfigMetadataSchema.extend({
  type: z.string(),
});
export type ConfigMetadataWithType = z.infer<typeof ConfigMetadataWithTypeSchema>;

/**
 * Full config object returned when fetching a specific config.
 * Timestamps are Unix epoch milliseconds, normalized by the server.
 */
export const ConfigSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    config: z.unknown(),
  })
  .merge(TimestampsSchema);
export type Config = z.infer<typeof ConfigSchema>;

// =============================================================================
// GET /api/configs
// =============================================================================

/**
 * Query params for GET /api/configs
 */
export const GetConfigsQuerySchema = z.object({
  type: z.string().optional(),
});
export type GetConfigsQuery = z.infer<typeof GetConfigsQuerySchema>;

/**
 * Response for GET /api/configs
 */
export const GetConfigsResponseSchema = z.object({
  configs: z.array(ConfigMetadataWithTypeSchema),
});
export type GetConfigsResponse = z.infer<typeof GetConfigsResponseSchema>;

// =============================================================================
// POST /api/configs
// =============================================================================

/**
 * Request body for POST /api/configs
 */
export const CreateConfigRequestSchema = z.object({
  name: z.string(),
  type: z.string(),
  config: z.unknown(),
});
export type CreateConfigRequest = z.infer<typeof CreateConfigRequestSchema>;

/**
 * Response for POST /api/configs
 * createdAt is Unix epoch milliseconds.
 */
export const CreateConfigResponseSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
});
export type CreateConfigResponse = z.infer<typeof CreateConfigResponseSchema>;

// =============================================================================
// GET /api/configs/:type
// =============================================================================

/**
 * Params for GET /api/configs/:type
 */
export const GetConfigsByTypeParamsSchema = z.object({
  type: z.string(),
});
export type GetConfigsByTypeParams = z.infer<typeof GetConfigsByTypeParamsSchema>;

/**
 * Response for GET /api/configs/:type
 */
export const GetConfigsByTypeResponseSchema = z.object({
  configs: z.array(ConfigMetadataSchema),
});
export type GetConfigsByTypeResponse = z.infer<typeof GetConfigsByTypeResponseSchema>;

// =============================================================================
// GET /api/configs/:type/:id
// =============================================================================

/**
 * Params for GET /api/configs/:type/:id
 */
export const GetConfigParamsSchema = z.object({
  type: z.string(),
  id: z.string(),
});
export type GetConfigParams = z.infer<typeof GetConfigParamsSchema>;

/**
 * Response for GET /api/configs/:type/:id
 * Returns the full config object.
 */
export const GetConfigResponseSchema = ConfigSchema;
export type GetConfigResponse = z.infer<typeof GetConfigResponseSchema>;
