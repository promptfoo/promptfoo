import { z } from 'zod';

// Example schema for structured output validation
// This demonstrates how to use Zod schemas with the Vercel AI SDK
export const promptSchema = z.object({
  response: z.string().describe('The AI-generated response'),
  confidence: z.number().describe('Confidence level of the response (0-1)'),
  category: z
    .enum(['information', 'instruction', 'question', 'other'])
    .describe('Category of the prompt'),
  metadata: z
    .object({
      language: z.string().optional().describe('Detected language'),
      sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
    })
    .optional()
    .describe('Additional metadata about the response'),
});

/**
 * @typedef {import('zod').infer<typeof promptSchema>} PromptResponse
 */
