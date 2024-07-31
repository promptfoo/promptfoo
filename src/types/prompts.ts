import { z } from 'zod';
import type { ApiProvider } from './providers';

export const PromptConfigSchema = z.object({
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});

export type PromptConfig = z.infer<typeof PromptConfigSchema>;

export type PromptFunctionContext = {
  vars: Record<string, string | object>;
  provider: {
    id: string;
    label?: string;
  };
};

export const PromptFunctionSchema = z
  .function()
  .args(
    z.object({
      vars: z.record(z.union([z.string(), z.any()])),
      provider: z.custom<ApiProvider>().optional(),
    }),
  )
  .returns(z.promise(z.union([z.string(), z.any()])));

export type PromptFunction = z.infer<typeof PromptFunctionSchema>;

export const PromptSchema = z.object({
  id: z.string().optional(),
  raw: z.string(),
  /**
   * @deprecated in > 0.59.0. Use `label` instead.
   */
  display: z.string().optional(),
  label: z.string(),
  function: PromptFunctionSchema.optional(),
});

export type Prompt = z.infer<typeof PromptSchema>;
