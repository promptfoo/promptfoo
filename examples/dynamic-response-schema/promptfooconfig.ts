import type { UnifiedConfig } from 'promptfoo';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import { createConversationSchema } from './src/schemas/conversation';

// Create the schema instance with a default language
const schema = createConversationSchema('english');

// Generate the response format for OpenAI
const responseFormat = zodResponseFormat(schema, 'conversation_response');

// Helper function to clean schema for Gemini compatibility
function cleanSchemaForGemini(schema: any): any {
  if (typeof schema !== 'object' || schema === null) return schema;

  const cleaned = { ...schema };
  
  // Remove properties that Gemini doesn't support
  delete cleaned.additionalProperties;
  delete cleaned.$schema;

  // Recursively clean nested objects
  if (cleaned.properties) {
    cleaned.properties = Object.fromEntries(
      Object.entries(cleaned.properties).map(([key, value]) => [
        key,
        cleanSchemaForGemini(value),
      ]),
    );
  }

  if (cleaned.items) {
    cleaned.items = cleanSchemaForGemini(cleaned.items);
  }

  // Clean anyOf/oneOf/allOf
  if (cleaned.anyOf) {
    cleaned.anyOf = cleaned.anyOf.map(cleanSchemaForGemini);
  }
  if (cleaned.oneOf) {
    cleaned.oneOf = cleaned.oneOf.map(cleanSchemaForGemini);
  }
  if (cleaned.allOf) {
    cleaned.allOf = cleaned.allOf.map(cleanSchemaForGemini);
  }

  // Handle definitions if present
  if (cleaned.definitions) {
    cleaned.definitions = Object.fromEntries(
      Object.entries(cleaned.definitions).map(([key, value]) => [
        key,
        cleanSchemaForGemini(value),
      ]),
    );
  }

  return cleaned;
}

const config: UnifiedConfig = {
  description: 'Dynamic schema generation for language learning conversations',
  
  prompts: ['file://prompts/conversation.txt'],
  
  providers: [
    {
      id: 'openai:gpt-4o-mini',
      label: 'GPT-4o Mini with Schema',
      config: {
        response_format: responseFormat,
      },
    },
    {
      id: 'google:gemini-2.0-flash-exp',
      label: 'Gemini with Schema',
      config: {
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: cleanSchemaForGemini(responseFormat.json_schema.schema),
        },
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
        {
          type: 'javascript',
          value: `
            const parsed = typeof output === 'string' ? JSON.parse(output) : output;
            // Validate it includes business-related topics
            return parsed.topics && parsed.topics.some(t => 
              t.topic.toLowerCase().includes('business') ||
              t.topic.toLowerCase().includes('finance') ||
              t.topic.toLowerCase().includes('technology')
            );
          `,
        },
      ],
    },
    {
      vars: {
        userLanguage: 'Spanish',
        learningGoal: 'Improve German pronunciation and grammar',
        currentLevel: 'intermediate',
        interests: 'music, literature, philosophy',
      },
      assert: [
        {
          type: 'is-json',
        },
        {
          type: 'javascript',
          value: `
            const parsed = typeof output === 'string' ? JSON.parse(output) : output;
            // Check appropriate difficulty
            return parsed.difficulty === 'intermediate';
          `,
        },
        {
          type: 'javascript',
          value: `
            const parsed = typeof output === 'string' ? JSON.parse(output) : output;
            // Validate duration is reasonable
            return parsed.duration >= 10 && parsed.duration <= 30;
          `,
        },
      ],
    },
  ],

  outputPath: './results.json',
};

export default config; 