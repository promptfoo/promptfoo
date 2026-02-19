import { z } from 'zod';

// GET /api/configs

export const ListConfigsQuerySchema = z.object({
  type: z.string().min(1).optional(),
});

const ConfigSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  type: z.string(),
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
  config: z.unknown(),
});

export const CreateConfigResponseSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
});

export type CreateConfigRequest = z.infer<typeof CreateConfigRequestSchema>;
export type CreateConfigResponse = z.infer<typeof CreateConfigResponseSchema>;

// GET /api/configs/:type

export const ListConfigsByTypeParamsSchema = z.object({
  type: z.string().min(1),
});

const ConfigByTypeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const ListConfigsByTypeResponseSchema = z.object({
  configs: z.array(ConfigByTypeSummarySchema),
});

export type ListConfigsByTypeParams = z.infer<typeof ListConfigsByTypeParamsSchema>;
export type ListConfigsByTypeResponse = z.infer<typeof ListConfigsByTypeResponseSchema>;

// GET /api/configs/:type/:id

export const GetConfigParamsSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

export const GetConfigResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    type: z.string(),
    config: z.unknown(),
  })
  .passthrough();

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
