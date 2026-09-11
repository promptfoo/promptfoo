import { z } from 'zod';

const JsonProviderInputConfigBaseSchema = z.object({
  benign: z.boolean().optional(),
  inputPurpose: z.string().min(1).optional(),
});
const JsonProviderTextInputConfigSchema = JsonProviderInputConfigBaseSchema.extend({
  injectionPlacements: z.array(z.string().min(1)).min(1).optional(),
});
const JsonProviderDocumentInputConfigSchema = JsonProviderInputConfigBaseSchema.extend({
  injectionPlacements: z
    .array(z.enum(['body', 'header', 'footer']))
    .min(1)
    .optional(),
});
const JsonProviderDocxInputConfigSchema = JsonProviderInputConfigBaseSchema.extend({
  injectionPlacements: z
    .array(z.enum(['body', 'comment', 'footnote', 'header', 'footer']))
    .min(1)
    .optional(),
});
const JsonProviderInputDefinitionSchema = z.union([
  z.string().min(1),
  z.object({
    config: JsonProviderTextInputConfigSchema.optional(),
    description: z.string().min(1),
    type: z.literal('text').optional(),
  }),
  z.object({
    config: JsonProviderDocumentInputConfigSchema.optional(),
    description: z.string().min(1),
    type: z.literal('pdf'),
  }),
  z.object({
    config: JsonProviderDocxInputConfigSchema.optional(),
    description: z.string().min(1),
    type: z.literal('docx'),
  }),
  z.object({
    config: JsonProviderDocumentInputConfigSchema.optional(),
    description: z.string().min(1),
    type: z.literal('image'),
  }),
]);

/**
 * JSON-safe provider options for API requests and OpenAPI generation.
 *
 * ProviderOptionsSchema also accepts in-process functions and uses a closed env object.
 * HTTP clients cannot send functions, and preview requests must retain arbitrary string env
 * overrides used by custom provider templates.
 */
export const JsonProviderOptionsWithIdSchema = z
  .object({
    id: z.string().min(1, 'Provider ID is required'),
    label: z.string().optional(),
    config: z.unknown().optional(),
    prompts: z.array(z.string()).optional(),
    transform: z.string().optional(),
    delay: z.number().optional(),
    env: z.record(z.string(), z.string()).optional(),
    inputs: z
      .record(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/), JsonProviderInputDefinitionSchema)
      .optional(),
  })
  .passthrough();

