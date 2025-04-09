import { z } from 'zod';
import type { PromptConfig, PromptFunction } from '../types/prompts';
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

export const ChatMessageSchema = z
  .object({
    role: z.string(),
    content: z.string(),
  })
  .passthrough(); // Allow additional properties like name, function_call, etc.

// This type ensures that Zod.infer<typeof ChatMessageSchema> matches ChatMessage
export type ChatMessageSchemaType = z.infer<typeof ChatMessageSchema>;

// The base schema with common fields
const BasePromptSchema = z
  .object({
    id: z.string().optional(),
    display: z.string().optional(),
    label: z.string(),
    function: PromptFunctionSchema.optional(),
    config: z.any().optional(),
  })
  .passthrough();

// A prompt must have either a raw field or messages field
export const PromptSchema = z.union([
  // Option 1: Has raw string (messages optional)
  BasePromptSchema.extend({
    raw: z.string(),
    messages: z.array(ChatMessageSchema).optional(),
  }),
  // Option 2: Has messages array (raw optional)
  BasePromptSchema.extend({
    raw: z.string().optional(),
    messages: z.array(ChatMessageSchema),
  }),
]);

// Ensure that schemas match their corresponding types
type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function assert<T extends true>() {}

assert<AssertEqual<PromptConfig, z.infer<typeof PromptConfigSchema>>>();
assert<AssertEqual<PromptFunction, z.infer<typeof PromptFunctionSchema>>>();
// Skip the assertion for Prompt since we're using a union
// assert<AssertEqual<Prompt, z.infer<typeof PromptSchema>>>();
