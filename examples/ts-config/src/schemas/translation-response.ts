import { z } from 'zod';

// Fun schema for creative translation responses
export const TranslationResponseSchema = z.object({
  translation: z.string().describe('The translated text'),
  language: z.string().describe('The target language or style'),
  confidence: z.number().min(0).max(1).describe('How confident the AI is (0-1)'),
  funFactor: z.number().min(0).max(10).nullable().describe('Fun rating from 0-10'),
  culturalNotes: z.string().nullable().describe('Any amusing cultural observations'),
});

export type TranslationResponse = z.infer<typeof TranslationResponseSchema>;
