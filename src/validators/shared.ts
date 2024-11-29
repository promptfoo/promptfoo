import { z } from 'zod';

export const TokenUsageSchema = z.object({
  cached: z.number().optional(),
  completion: z.number().optional(),
  prompt: z.number().optional(),
  total: z.number().optional(),
  numRequests: z.number().optional(),
});

export const NunjucksFilterMapSchema = z.record(
  z.string(),
  z.function(z.tuple([z.any()]).rest(z.any()), z.string()),
);
