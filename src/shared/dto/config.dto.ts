import { z } from 'zod';

// Config type enum
export const ConfigTypeEnum = z.enum(['prompt', 'eval', 'dataset']);
export type ConfigType = z.infer<typeof ConfigTypeEnum>;

export const ConfigDTOSchemas = {
  List: {
    Query: z.object({
      type: ConfigTypeEnum.optional(),
    }),
    Response: z.object({
      configs: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: ConfigTypeEnum,
        config: z.any(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime().optional(),
      })),
    }),
  },
  Create: {
    Request: z.object({
      name: z.string().min(1),
      type: ConfigTypeEnum,
      config: z.any(),
    }),
    Response: z.object({
      id: z.string(),
      createdAt: z.string().datetime(),
    }),
  },
  GetByType: {
    Params: z.object({
      type: ConfigTypeEnum,
    }),
    Response: z.object({
      configs: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: ConfigTypeEnum,
        config: z.any(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime().optional(),
      })),
    }),
  },
  Get: {
    Params: z.object({
      type: ConfigTypeEnum,
      id: z.string(),
    }),
    Response: z.any(), // Raw config object
  },
};

// Type exports
export type ConfigListQuery = z.infer<typeof ConfigDTOSchemas.List.Query>;
export type ConfigListResponse = z.infer<typeof ConfigDTOSchemas.List.Response>;
export type ConfigCreateRequest = z.infer<typeof ConfigDTOSchemas.Create.Request>;
export type ConfigCreateResponse = z.infer<typeof ConfigDTOSchemas.Create.Response>;
export type ConfigGetByTypeParams = z.infer<typeof ConfigDTOSchemas.GetByType.Params>;
export type ConfigGetByTypeResponse = z.infer<typeof ConfigDTOSchemas.GetByType.Response>;
export type ConfigGetParams = z.infer<typeof ConfigDTOSchemas.Get.Params>;
export type ConfigGetResponse = z.infer<typeof ConfigDTOSchemas.Get.Response>;