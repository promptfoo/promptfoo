import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import { TranslationResponseSchema } from './src/schemas/translation-response';
import type { UnifiedConfig } from 'promptfoo';

// Generate the response format for OpenAI
const responseFormat = zodResponseFormat(TranslationResponseSchema, 'translation_response');

// Helper to adapt schema for Gemini (removes OpenAI-specific fields)
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

const config: UnifiedConfig = {
  description: 'Fun translation tests with structured outputs',

  prompts: [
    `You are a creative translator who adds personality to translations.

Translate this to {{language}}: "{{text}}"

Return a JSON response with your translation, confidence level, and any fun cultural notes.`,
  ],

  providers: [
    {
      id: 'openai:gpt-5-mini',
      label: 'GPT-5 Mini (structured)',
      config: {
        response_format: responseFormat,
      },
    },
    {
      id: 'google:gemini-2.5-flash',
      label: 'Gemini 2.5 Flash (structured)',
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
            // Check for valid pirate speak patterns
            const text = parsed.translation.toLowerCase();
            const hasPirateSpeak = text.includes('arr') || text.includes('matey') ||
                                    text.includes('ye') || text.includes("me ") ||
                                    text.includes("'t ") || text.match(/\bt'\b/) ||
                                    text.includes('brew');
            return parsed.translation &&
                   parsed.language.toLowerCase().includes('pirate') &&
                   hasPirateSpeak;
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
            const text = parsed.translation.toLowerCase();
            return parsed.translation &&
                   (text.includes('thou') || text.includes('thee') ||
                    text.includes('doth') || text.includes('hath') ||
                    text.includes('alas') || text.includes('lieth') ||
                    text.includes('woeful') || text.includes('undone') ||
                    text.includes('forsooth') || text.includes('prithee') ||
                    text.includes('verily') || text.match(/eth\\b/));
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
                    translation.includes('goat') ||
                    translation.includes('lowkey') ||
                    translation.includes('low-key') ||
                    translation.includes('no cap') ||
                    translation.includes(' fr') ||
                    translation.includes('insane'));
          `,
        },
      ],
    },
  ],
};

export default config;
