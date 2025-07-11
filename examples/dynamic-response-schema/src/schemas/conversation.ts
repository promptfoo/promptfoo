import { z } from 'zod';

// Define the conversation schema that your application uses
export const ConversationSchema = z.object({
  scenario: z.string().describe('The conversation scenario or context'),
  preamble: z.string().describe('Opening statement to set the tone'),
  targetLanguage: z.string().describe('The language to use in the conversation'),
  understoodLanguage: z.string().describe('The language the user understands'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).describe('Conversation difficulty level'),
  formality: z.enum(['casual', 'formal', 'business']).describe('Level of formality'),
  tags: z.array(z.string()).describe('Relevant tags for the conversation'),
  topics: z.array(z.object({
    topic: z.string(),
    subtopics: z.array(z.string()).nullable().optional(),
  })).describe('Main topics to cover in the conversation'),
  culturalNotes: z.string().nullable().optional().describe('Cultural considerations if any'),
  duration: z.number().min(1).max(60).describe('Expected conversation duration in minutes'),
});

// Type inference for TypeScript
export type Conversation = z.infer<typeof ConversationSchema>;

// Factory function to create schema with language parameter
export function createConversationSchema(language: string) {
  return ConversationSchema.extend({
    defaultLanguage: z.literal(language),
  });
} 