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
});

/**
 * Complete token usage statistics, including assertion data
 */
export const TokenUsageSchema = BaseTokenUsageSchema.extend({
  assertions: BaseTokenUsageSchema.optional(),
});

// TypeScript types derived from schemas
export type BaseTokenUsage = z.infer<typeof BaseTokenUsageSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export type NunjucksFilterMap = Record<string, (...args: any[]) => string>;
