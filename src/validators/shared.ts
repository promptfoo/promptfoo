import { z } from 'zod';
import type { TokenUsage, BaseTokenUsage } from '../types/shared';

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
 * Helper function to accumulate token usage values from source to target
 *
 * @param target - The target token usage object to accumulate into
 * @param source - The source token usage object to accumulate from
 * @param safeAccess - Whether to use safe property access (default: true)
 * @returns The updated target token usage object
 */
export function accumulateTokenUsage(
  target: Partial<BaseTokenUsage>,
  source: Partial<BaseTokenUsage> | undefined,
  safeAccess = true,
): Partial<BaseTokenUsage> {
  if (!target || !source) {
    return target || {};
  }

  // Initialize fields if they don't exist
  target.total = target.total || 0;
  target.prompt = target.prompt || 0;
  target.completion = target.completion || 0;
  target.cached = target.cached || 0;
  target.numRequests = target.numRequests || 0;

  // Accumulate base fields
  target.total += source.total || 0;
  target.prompt += source.prompt || 0;
  target.completion += source.completion || 0;
  target.cached += source.cached || 0;
  target.numRequests += source.numRequests || 1; // Default to 1 if not specified

  // Handle completion details
  if (source.completionDetails) {
    if (!target.completionDetails) {
      target.completionDetails = {};
    }

    target.completionDetails.reasoning =
      (target.completionDetails.reasoning || 0) + (source.completionDetails.reasoning || 0);
    target.completionDetails.acceptedPrediction =
      (target.completionDetails.acceptedPrediction || 0) +
      (source.completionDetails.acceptedPrediction || 0);
    target.completionDetails.rejectedPrediction =
      (target.completionDetails.rejectedPrediction || 0) +
      (source.completionDetails.rejectedPrediction || 0);
  }

  return target;
}

/**
 * Validates token usage data against the TokenUsageSchema
 *
 * @param tokenUsage - The token usage data to validate
 * @param logWarnings - Whether to log warnings for validation failures (default: false)
 * @returns The validated token usage data, or the original data if validation fails
 */
export function validateTokenUsage(
  tokenUsage: Partial<TokenUsage>,
  logWarnings = false,
): Partial<TokenUsage> {
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
