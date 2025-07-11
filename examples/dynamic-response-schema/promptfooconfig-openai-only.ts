import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import type { UnifiedConfig } from 'promptfoo';
import { createConversationSchema } from './src/schemas/conversation';

// Create the schema instance with a default language
const schema = createConversationSchema('english');

// Generate the response format for OpenAI
const responseFormat = zodResponseFormat(schema, 'conversation_response');

const config: UnifiedConfig = {
  description: 'Dynamic schema generation for language learning conversations (OpenAI only)',

  prompts: ['file://prompts/conversation.txt'],

  providers: [
    {
      id: 'openai:gpt-4o-mini',
      label: 'GPT-4o Mini with Schema',
      config: {
        response_format: responseFormat,
      },
    },
    // You can also test without schema to compare
    {
      id: 'openai:gpt-4o-mini',
      label: 'GPT-4o Mini without Schema',
      config: {
        temperature: 0.7,
      },
    },
  ],

  tests: [
    {
      vars: {
        userLanguage: 'English',
        learningGoal: 'Conversational Spanish for travel',
        currentLevel: 'beginner',
        interests: 'food, culture, history',
      },
      assert: [
        {
          type: 'is-json',
        },
        {
          type: 'javascript',
          value: `
            // Handle both string and object responses
            const parsed = typeof output === 'string' ? JSON.parse(output) : output;
            // Check that schema fields are present
            return parsed.scenario && 
                   parsed.targetLanguage && 
                   parsed.difficulty &&
                   parsed.topics && 
                   Array.isArray(parsed.topics);
          `,
        },
        {
          type: 'javascript',
          value: `
            const parsed = typeof output === 'string' ? JSON.parse(output) : output;
            // Validate difficulty matches user level
            return parsed.difficulty === 'beginner';
          `,
        },
      ],
    },
    {
      vars: {
        userLanguage: 'Japanese',
        learningGoal: 'Business French',
        currentLevel: 'advanced',
        interests: 'technology, finance, entrepreneurship',
      },
      assert: [
        {
          type: 'is-json',
        },
        {
          type: 'javascript',
          value: `
            const parsed = typeof output === 'string' ? JSON.parse(output) : output;
            // Check formality for business context
            return parsed.formality === 'business' || parsed.formality === 'formal';
          `,
        },
      ],
    },
  ],

  outputPath: './results.json',
};

export default config;
