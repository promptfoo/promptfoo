import { z } from 'zod';

// for reasoning models
export const CompletionTokenDetailsSchema = z.object({
  reasoning: z.number().optional(),
  acceptedPrediction: z.number().optional(),
  rejectedPrediction: z.number().optional(),
});

export type CompletionTokenDetails = z.infer<typeof CompletionTokenDetailsSchema>;

/**
 * Base schema for token usage statistics with all fields optional
 */
export const BaseTokenUsageSchema = z.object({
  // Core token counts
  prompt: z.number().optional(),
  completion: z.number().optional(),
  cached: z.number().optional(),
  total: z.number().optional(),

  // Request metadata
  numRequests: z.number().optional(),

  // Detailed completion information
  completionDetails: CompletionTokenDetailsSchema.optional(),

  // Assertion token usage (model-graded assertions)
  assertions: z
    .object({
      total: z.number().optional(),
      prompt: z.number().optional(),
      completion: z.number().optional(),
      cached: z.number().optional(),
      numRequests: z.number().optional(),
      completionDetails: CompletionTokenDetailsSchema.optional(),
    })
    .optional(),
});

// TypeScript types derived from schemas
export type BaseTokenUsage = z.infer<typeof BaseTokenUsageSchema>;
export type TokenUsage = z.infer<typeof BaseTokenUsageSchema>;

export type NunjucksFilterMap = Record<string, (...args: any[]) => string>;

// Inputs schema for multi-variable test case generation
// Keys are variable names, values are descriptions of what the variable should contain
export const InputsSchema = z.record(
  z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
      error: 'Input variable names must be valid identifiers (start with letter or underscore)'
}),
  z.string().min(1, {
      error: 'Input descriptions must be non-empty strings'
}),
);
export type Inputs = z.infer<typeof InputsSchema>;
