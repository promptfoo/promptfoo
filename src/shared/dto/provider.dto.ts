import { z } from 'zod';

// Provider schemas
const ProviderOptionsSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  config: z.any().optional(),
  prompts: z.array(z.string()).optional(),
  transform: z.string().optional(),
  delay: z.number().optional(),
  // Add other provider options as needed
}).catchall(z.any());

export const ProviderDTOSchemas = {
  Test: {
    Request: ProviderOptionsSchema,
    Response: z.object({
      success: z.boolean(),
      output: z.string().optional(),
      error: z.string().optional(),
      tokenUsage: z.object({
        total: z.number(),
        prompt: z.number(),
        completion: z.number(),
        cached: z.number().optional(),
      }).optional(),
      cost: z.number().optional(),
      latencyMs: z.number().optional(),
    }),
  },
  Discover: {
    Request: ProviderOptionsSchema,
    Response: z.object({
      purpose: z.string().nullable(),
      limitations: z.string().nullable(),
      user: z.string().nullable(),
      tools: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          arguments: z.array(z.object({
            type: z.string(),
            name: z.string(),
            description: z.string(),
          })),
        }).nullable()
      ),
    }),
  },
};

// Type exports
export type ProviderTestRequest = z.infer<typeof ProviderDTOSchemas.Test.Request>;
export type ProviderTestResponse = z.infer<typeof ProviderDTOSchemas.Test.Response>;
export type ProviderDiscoverRequest = z.infer<typeof ProviderDTOSchemas.Discover.Request>;
export type ProviderDiscoverResponse = z.infer<typeof ProviderDTOSchemas.Discover.Response>;