import { z } from 'zod';
import { ProviderSchema } from './providers';

const RubricPromptSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.array(
    z.object({
      role: z.string(),
      content: z.string(),
    }),
  ),
]);

const GradingProviderMapSchema = z
  .object({
    embedding: ProviderSchema.optional(),
    classification: ProviderSchema.optional(),
    text: ProviderSchema.optional(),
    moderation: ProviderSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((provider) => provider !== undefined), {
    message: 'Grading provider map must specify at least one provider type.',
  });

const GradingProviderSchema = z.union([GradingProviderMapSchema, ProviderSchema]);

export const GradingConfigSchema = z.object({
  rubricPrompt: RubricPromptSchema.optional(),
  provider: GradingProviderSchema.optional(),
  factuality: z
    .object({
      subset: z.number().optional(),
      superset: z.number().optional(),
      agree: z.number().optional(),
      disagree: z.number().optional(),
      differButFactual: z.number().optional(),
    })
    .optional(),
});

export type GradingConfig = z.infer<typeof GradingConfigSchema>;
