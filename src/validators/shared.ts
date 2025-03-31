import { z } from 'zod';

export const CompletionTokenDetailsSchema = z.object({
  reasoning: z.number().optional(),
  acceptedPrediction: z.number().optional(),
  rejectedPrediction: z.number().optional(),
});

export const TokenUsageSchema = z.object({
  prompt: z.number().optional(),
  completion: z.number().optional(),
  cached: z.number().optional(),
  total: z.number().optional(),
  numRequests: z.number().optional(),
  completionDetails: CompletionTokenDetailsSchema.optional(),
  assertions: z
    .object({
      total: z.number(),
      prompt: z.number(),
      completion: z.number(),
      cached: z.number(),
    })
    .optional(),
});

export const NunjucksFilterMapSchema = z.record(
  z.string(),
  z.function(z.tuple([z.any()]).rest(z.any()), z.string()),
);
