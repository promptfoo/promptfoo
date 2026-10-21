import { z } from 'zod';
import { ProviderEnvOverridesSchema } from '../env.js';
import { InputsInputSchema } from '../shared.js';

/** Provider-owned configuration is closed; request payloads and schemas remain open JSON. */
export const JsonObjectInputSchema = z.record(z.string(), z.json());
export const FileReferenceInputSchema = z.templateLiteral(['file://', z.string().regex(/[\s\S]+/)]);

/** Serializable metadata shared by typed provider options. No execution defaults are applied. */
export const ProviderOptionsInputFieldsSchema = z.strictObject({
  label: z.string().optional(),
  prompts: z.array(z.string()).optional(),
  transform: z.string().optional(),
  delay: z.number().optional(),
  env: ProviderEnvOverridesSchema.catchall(z.string()).optional(),
  inputs: InputsInputSchema.optional(),
});
