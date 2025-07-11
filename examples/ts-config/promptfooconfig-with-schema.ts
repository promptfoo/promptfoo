import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import type { UnifiedConfig } from 'promptfoo';
import { TranslationResponseSchema } from './src/schemas/translation-response';

// Generate the response format for OpenAI
const responseFormat = zodResponseFormat(TranslationResponseSchema, 'translation_response');

// Helper to adapt schema for Gemini (removes OpenAI-specific fields)
function adaptSchemaForGemini(schema: any): any {
  const cleaned = { ...schema };
  delete cleaned.additionalProperties;
  delete cleaned.$schema;

  if (cleaned.properties) {
    cleaned.properties = Object.fromEntries(
      Object.entries(cleaned.properties).map(([key, value]) => [
        key,
        typeof value === 'object' ? adaptSchemaForGemini(value) : value,
      ]),
    );
  }

  if (cleaned.items) {
    cleaned.items = adaptSchemaForGemini(cleaned.items);
  }

  return cleaned;
}

const config: UnifiedConfig = {
  description: 'Fun translation tests with structured outputs',

  prompts: [
    `You are a creative translator who adds personality to translations.

Translate this to {{language}}: "{{text}}"

Return a JSON response with your translation, confidence level, and any fun cultural notes.`,
  ],

  providers: [
    {
      id: 'openai:gpt-4o-mini',
      label: 'GPT-4o Mini (structured)',
      config: {
        response_format: responseFormat,
      },
    },
    {
      id: 'anthropic:claude-3-5-sonnet-20241022',
      label: 'Claude 3.5 Sonnet',
      // Claude doesn't need special config for JSON
    },
    {
      id: 'google:gemini-2.0-flash-exp',
      label: 'Gemini 2.0 Flash (structured)',
      config: {
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: adaptSchemaForGemini(responseFormat.json_schema.schema),
        },
      },
    },
  ],

  tests: [
    {
      vars: {
        language: 'Pirate speak',
        text: "I can't find my coffee",
      },
      assert: [
        {
          type: 'javascript',
          value: `
            // Handle both object and string outputs
            const parsed = typeof output === 'object' ? output : 
                          JSON.parse(output.replace(/^\`\`\`json\\s*|\\s*\`\`\`$/g, ''));
            return parsed.translation && 
                   parsed.language.toLowerCase().includes('pirate') &&
                   (parsed.translation.toLowerCase().includes('arr') || 
                    parsed.translation.toLowerCase().includes('matey') ||
                    parsed.translation.toLowerCase().includes('ye'));
          `,
        },
      ],
    },
    {
      vars: {
        language: 'Shakespeare English',
        text: 'This app is broken',
      },
      assert: [
        {
          type: 'javascript',
          value: `
            const parsed = typeof output === 'object' ? output : 
                          JSON.parse(output.replace(/^\`\`\`json\\s*|\\s*\`\`\`$/g, ''));
            return parsed.translation && 
                   (parsed.translation.toLowerCase().includes('thou') || 
                    parsed.translation.toLowerCase().includes('thee') ||
                    parsed.translation.toLowerCase().includes('doth') ||
                    parsed.translation.toLowerCase().includes('hath'));
          `,
        },
      ],
    },
    {
      vars: {
        language: 'Gen Z slang',
        text: "That's really impressive",
      },
      assert: [
        {
          type: 'javascript',
          value: `
            const parsed = typeof output === 'object' ? output : 
                          JSON.parse(output.replace(/^\`\`\`json\\s*|\\s*\`\`\`$/g, ''));
            const translation = parsed.translation.toLowerCase();
            return parsed.translation && 
                   parsed.confidence > 0 &&
                   (translation.includes('slay') || 
                    translation.includes('fire') ||
                    translation.includes('bussin') ||
                    translation.includes('lit') ||
                    translation.includes('no cap'));
          `,
        },
      ],
    },
  ],
};

export default config;
