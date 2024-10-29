import { z } from 'zod';

export const LLMFileSchema = z.object({
  url: z.string(),
  mimeType: z.string(),
  uploadTime: z.number(),
  originalUrl: z.string(),
});

export type LLMFile = z.infer<typeof LLMFileSchema>;