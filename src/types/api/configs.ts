import { z } from 'zod';

/**
 * Timestamp schema: SQLite CURRENT_TIMESTAMP stores text ("2025-12-29 04:21:47"),
 * but Drizzle declares the column as integer. Accept both for safety.
 */
const TimestampSchema = z.union([z.string(), z.number()]);

/** Base config fields shared across list and detail responses. */
const BaseConfigSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

const ConfigSummarySchema = BaseConfigSummarySchema.extend({
  type: z.string(),
});

// GET /api/configs

export const ListConfigsQuerySchema = z.object({
  type: z.string().min(1).optional(),
});

export const ListConfigsResponseSchema = z.object({
  configs: z.array(ConfigSummarySchema),
});

export type ListConfigsQuery = z.infer<typeof ListConfigsQuerySchema>;
export type ListConfigsResponse = z.infer<typeof ListConfigsResponseSchema>;

// POST /api/configs

export const CreateConfigRequestSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  config: z.unknown().refine((v) => v != null, { message: 'config is required' }),
});

export const CreateConfigResponseSchema = z.object({
  id: z.string(),
  createdAt: TimestampSchema,
});

export type CreateConfigRequest = z.infer<typeof CreateConfigRequestSchema>;
export type CreateConfigResponse = z.infer<typeof CreateConfigResponseSchema>;

// GET /api/configs/:type

export const ListConfigsByTypeParamsSchema = z.object({
  type: z.string().min(1),
});

export const ListConfigsByTypeResponseSchema = z.object({
  configs: z.array(BaseConfigSummarySchema),
});

export type ListConfigsByTypeParams = z.infer<typeof ListConfigsByTypeParamsSchema>;
export type ListConfigsByTypeResponse = z.infer<typeof ListConfigsByTypeResponseSchema>;

// GET /api/configs/:type/:id

export const GetConfigParamsSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

export const GetConfigResponseSchema = ConfigSummarySchema.extend({
  config: z.unknown(),
}).passthrough();

export type GetConfigParams = z.infer<typeof GetConfigParamsSchema>;
export type GetConfigResponse = z.infer<typeof GetConfigResponseSchema>;

/** Grouped schemas for server-side validation. */
export const ConfigSchemas = {
  List: {
    Query: ListConfigsQuerySchema,
    Response: ListConfigsResponseSchema,
  },
  Create: {
    Request: CreateConfigRequestSchema,
    Response: CreateConfigResponseSchema,
  },
  ListByType: {
    Params: ListConfigsByTypeParamsSchema,
    Response: ListConfigsByTypeResponseSchema,
  },
  Get: {
    Params: GetConfigParamsSchema,
    Response: GetConfigResponseSchema,
  },
} as const;
