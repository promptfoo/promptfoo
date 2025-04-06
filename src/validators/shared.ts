import { z } from 'zod';
import type { TokenUsage } from '../types/shared';

export const CompletionTokenDetailsSchema = z.object({
  reasoning: z.number().optional(),
  acceptedPrediction: z.number().optional(),
  rejectedPrediction: z.number().optional(),
});

export const BaseTokenUsageSchema = z.object({
  cached: z.number().optional(),
  completion: z.number().optional(),
  prompt: z.number().optional(),
  total: z.number().optional(),
  numRequests: z.number().optional(),
  completionDetails: CompletionTokenDetailsSchema.optional(),
});

export const TokenUsageSchema = BaseTokenUsageSchema.extend({
  assertions: BaseTokenUsageSchema.optional(),
});

export const NunjucksFilterMapSchema = z.record(
  z.string(),
  z.function(z.tuple([z.any()]).rest(z.any()), z.string()),
);

/**
 * Validates token usage data against the TokenUsageSchema
 * 
 * @param tokenUsage - The token usage data to validate
 * @param logWarnings - Whether to log warnings for validation failures (default: false)
 * @returns The validated token usage data, or the original data if validation fails
 */
export function validateTokenUsage(tokenUsage: Partial<TokenUsage>, logWarnings = false): Partial<TokenUsage> {
  if (!tokenUsage) {
    return {};
  }
  
  const validationResult = TokenUsageSchema.safeParse(tokenUsage);
  
  if (!validationResult.success) {
    if (logWarnings) {
      console.warn('Token usage validation failed:', validationResult.error.message);
    }
    return tokenUsage;
  }
  
  return validationResult.data;
}
