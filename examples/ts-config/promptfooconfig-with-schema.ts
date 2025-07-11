import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import type { UnifiedConfig } from 'promptfoo';
import { TranslationResponseSchema } from './src/schemas/translation-response';

// Generate the response format for OpenAI
const responseFormat = zodResponseFormat(TranslationResponseSchema, 'translation_response');

// Helper function to clean schema for Gemini compatibility
function cleanSchemaForGemini(schema: any): any {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  const cleaned = { ...schema };

  // Remove properties that Gemini doesn't support
  delete cleaned.additionalProperties;
  delete cleaned.$schema;

  // Recursively clean nested objects
  if (cleaned.properties) {
    cleaned.properties = Object.fromEntries(
      Object.entries(cleaned.properties).map(([key, value]) => [key, cleanSchemaForGemini(value)]),
    );
  }

  if (cleaned.items) {
    cleaned.items = cleanSchemaForGemini(cleaned.items);
  }

  return cleaned;
}

// Clean the schema for Gemini
const geminiSchema = cleanSchemaForGemini(responseFormat.json_schema.schema);

const config: UnifiedConfig = {
  description: 'Translation with structured outputs using dynamic schemas',

  prompts: [
    `You are a professional translator. Translate the following text to {{language}} and provide a structured response with translation details.

Text to translate: "{{body}}"

Provide your response in the required JSON format with translation, confidence score, and any relevant cultural notes.`,
  ],

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
          response_schema: geminiSchema,
        },
      },
    },
    // Test without schema for comparison
    {
      id: 'openai:gpt-4o-mini',
      label: 'GPT-4o Mini without Schema',
    },
  ],

  tests: [
    {
      vars: {
        language: 'French',
        body: 'Hello world',
      },
      assert: [
        {
          type: 'javascript',
          value: `
            // Handle both pure JSON and markdown-wrapped JSON
            let parsed;
            try {
              parsed = JSON.parse(output);
            } catch (e) {
              // Try to extract JSON from markdown code block
              const jsonMatch = output.match(/\`\`\`json\\s*([\\s\\S]*?)\\s*\`\`\`/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1]);
              } else {
                return false;
              }
            }
            return parsed.translation && parsed.language === 'French' && parsed.confidence >= 0;
          `,
        },
        {
          type: 'javascript',
          value: `
            // Handle both pure JSON and markdown-wrapped JSON
            let parsed;
            try {
              parsed = JSON.parse(output);
            } catch (e) {
              const jsonMatch = output.match(/\`\`\`json\\s*([\\s\\S]*?)\\s*\`\`\`/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1]);
              } else {
                return false;
              }
            }
            const translation = parsed.translation.toLowerCase();
            return translation.includes('bonjour') || translation.includes('salut');
          `,
        },
      ],
    },
    {
      vars: {
        language: 'Spanish',
        body: "I'm hungry",
      },
      assert: [
        {
          type: 'javascript',
          value: `
            // Handle both pure JSON and markdown-wrapped JSON
            let parsed;
            try {
              parsed = JSON.parse(output);
            } catch (e) {
              const jsonMatch = output.match(/\`\`\`json\\s*([\\s\\S]*?)\\s*\`\`\`/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1]);
              } else {
                return false;
              }
            }
            return parsed.translation && parsed.language === 'Spanish' && parsed.confidence >= 0;
          `,
        },
        {
          type: 'javascript',
          value: `
            // Handle both pure JSON and markdown-wrapped JSON
            let parsed;
            try {
              parsed = JSON.parse(output);
            } catch (e) {
              const jsonMatch = output.match(/\`\`\`json\\s*([\\s\\S]*?)\\s*\`\`\`/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1]);
              } else {
                return false;
              }
            }
            const translation = parsed.translation.toLowerCase();
            return translation.includes('hambre') || translation.includes('hambriento');
          `,
        },
      ],
    },
    {
      vars: {
        language: 'Japanese',
        body: 'Good morning',
      },
      assert: [
        {
          type: 'javascript',
          value: `
            // Handle both pure JSON and markdown-wrapped JSON
            let parsed;
            try {
              parsed = JSON.parse(output);
            } catch (e) {
              const jsonMatch = output.match(/\`\`\`json\\s*([\\s\\S]*?)\\s*\`\`\`/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1]);
              } else {
                return false;
              }
            }
            return parsed.translation && parsed.language === 'Japanese' && parsed.confidence >= 0;
          `,
        },
        {
          type: 'javascript',
          value: `
            // Handle both pure JSON and markdown-wrapped JSON
            let parsed;
            try {
              parsed = JSON.parse(output);
            } catch (e) {
              const jsonMatch = output.match(/\`\`\`json\\s*([\\s\\S]*?)\\s*\`\`\`/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1]);
              } else {
                return false;
              }
            }
            // Check for common Japanese greetings
            return parsed.translation.includes('おはよう') || 
                   parsed.translation.includes('お早う') ||
                   parsed.translation.includes('ohayou');
          `,
        },
      ],
    },
  ],
};

export default config;
