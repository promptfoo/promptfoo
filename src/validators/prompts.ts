import { z } from 'zod';

import type { Prompt, PromptConfig, PromptFunction } from '../types/prompts';

// Zod schemas for validation
export const PromptConfigSchema = z.object({
  /** Text prepended to the rendered prompt before it is sent to the provider. */
  prefix: z.string().optional(),
  /** Text appended to the rendered prompt before it is sent to the provider. */
  suffix: z.string().optional(),
});

const PromptFunctionSchema = z.custom<PromptFunction>((v) => typeof v === 'function');

export const PromptSchema = z.object({
  /** Stable prompt identifier used in results and prompt selection. */
  id: z.string().optional(),
  /** Raw prompt template before display-only decoration. */
  raw: z.string(),
  /** Internal undecorated prompt copy used when prefix or suffix wrapping is applied. */
  template: z.string().optional(),
  /**
   * @deprecated in > 0.59.0. Use `label` instead.
   */
  display: z.string().optional(),
  /** Human-readable label shown in reports and prompt selectors. */
  label: z.string(),
  /** Function-valued prompt renderer when the prompt is assembled at runtime. */
  function: PromptFunctionSchema.optional(),

  /** Prompt-local provider config overrides merged into the selected provider config. */
  config: z.any().optional(),
});

// Ensure that schemas match their corresponding types
type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;
function assert<_T extends true>() {}

assert<AssertEqual<PromptConfig, z.infer<typeof PromptConfigSchema>>>();
assert<AssertEqual<PromptFunction, z.infer<typeof PromptFunctionSchema>>>();
assert<AssertEqual<Prompt, z.infer<typeof PromptSchema>>>();
