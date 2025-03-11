import { z } from 'zod';

export const GuardrailResponseSchema = z.object({
  flaggedInput: z.boolean().optional(),
  flaggedOutput: z.boolean().optional(),
  flagged: z.boolean().optional(),
});
