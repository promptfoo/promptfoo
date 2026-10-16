import { z } from 'zod';
import { ProviderEnvOverridesSchema } from '../env.js';

/** Provider-owned configuration is closed; request payloads and schemas remain open JSON. */
export const JsonObjectInputSchema = z.record(z.string(), z.json());
export const FileReferenceInputSchema = z.templateLiteral(['file://', z.string().regex(/[\s\S]+/)]);

const InputConfigFields = z.strictObject({
  benign: z.boolean().optional(),
  inputPurpose: z.string().min(1).optional(),
});
// Structural variants preserve input-placement validation when exported to JSON Schema.
const InputsInputSchema = z.record(
  z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  z.union([
    z.string().min(1),
    z.strictObject({
      description: z.string().min(1),
      type: z.literal('text').optional(),
      config: InputConfigFields.extend({
        injectionPlacements: z.array(z.string().min(1)).min(1).optional(),
      }).optional(),
    }),
    z.strictObject({
      description: z.string().min(1),
      type: z.enum(['pdf', 'image']),
      config: InputConfigFields.extend({
        injectionPlacements: z
          .array(z.enum(['body', 'header', 'footer']))
          .min(1)
          .optional(),
      }).optional(),
    }),
    z.strictObject({
      description: z.string().min(1),
      type: z.literal('docx'),
      config: InputConfigFields.extend({
        injectionPlacements: z
          .array(z.enum(['body', 'comment', 'footnote', 'header', 'footer']))
          .min(1)
          .optional(),
      }).optional(),
    }),
  ]),
);

/** Serializable metadata shared by typed provider options. No execution defaults are applied. */
export const ProviderOptionsInputFieldsSchema = z.strictObject({
  label: z.string().optional(),
  prompts: z.array(z.string()).optional(),
  transform: z.string().optional(),
  delay: z.number().optional(),
  env: ProviderEnvOverridesSchema.catchall(z.string()).optional(),
  inputs: InputsInputSchema.optional(),
});
