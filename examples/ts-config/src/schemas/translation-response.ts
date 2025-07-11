import { z } from 'zod';

// Schema for structured translation responses
export const TranslationResponseSchema = z.object({
  translation: z.string().describe('The translated text'),
  language: z.string().describe('The target language'),
  confidence: z.number().min(0).max(1).describe('Confidence score of the translation'),
  alternatives: z.array(z.string()).nullable().describe('Alternative translations if available'),
  culturalNotes: z.string().nullable().describe('Cultural context or notes about the translation'),
  formality: z
    .enum(['informal', 'neutral', 'formal'])
    .nullable()
    .describe('The formality level of the translation'),
});

export type TranslationResponse = z.infer<typeof TranslationResponseSchema>;
