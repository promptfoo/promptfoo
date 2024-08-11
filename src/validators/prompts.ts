import { z } from 'zod';
import type { Prompt, PromptConfig, PromptFunction } from '../types/prompts';
import type { ApiProvider } from '../types/providers';

// Zod schemas for validation
export const PromptConfigSchema = z.object({
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});

export const PromptFunctionSchema = z
  .function()
  .args(
    z.object({
      vars: z.record(z.union([z.string(), z.any()])),
      provider: z.custom<ApiProvider>().optional(),
    }),
  )
  .returns(z.promise(z.union([z.string(), z.any()])));

export const PromptSchema = z.object({
  id: z.string().optional(),
  raw: z.string(),
  /**
   * @deprecated in > 0.59.0. Use `label` instead.
   */
  display: z.string().optional(),
  label: z.string(),
  function: PromptFunctionSchema.optional(),

  // These config options are merged into the provider config.
  config: z.any().optional(),
});

// Ensure that schemas match their corresponding types
type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function assert<T extends true>() {}

assert<AssertEqual<PromptConfig, z.infer<typeof PromptConfigSchema>>>();
assert<AssertEqual<PromptFunction, z.infer<typeof PromptFunctionSchema>>>();
assert<AssertEqual<Prompt, z.infer<typeof PromptSchema>>>();
