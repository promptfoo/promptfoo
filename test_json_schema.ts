import * as dotenv from 'dotenv';
import { OpenAiResponsesProvider } from './src/providers/openai/responses';

// Load environment variables
dotenv.config();

async function testJsonSchema() {
  // Create a provider with json_schema config
  const provider = new OpenAiResponsesProvider('gpt-4o', {
    config: {
      temperature: 0.7,
      max_output_tokens: 500,
      instructions: 'You are a helpful, creative AI assistant. Return a well-structured story.',
      response_format: {
        type: 'json_schema',
        json_schema: {
          schema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'The title of the story',
              },
              setting: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'Where the story takes place',
                  },
                  time_period: {
                    type: 'string',
                    description: 'When the story takes place',
                  },
                },
                required: ['location', 'time_period'],
                additionalProperties: false,
              },
              characters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                    },
                    description: {
                      type: 'string',
                    },
                  },
                  required: ['name', 'description'],
                  additionalProperties: false,
                },
              },
              plot: {
                type: 'object',
                properties: {
                  beginning: {
                    type: 'string',
                  },
                  middle: {
                    type: 'string',
                  },
                  end: {
                    type: 'string',
                  },
                },
                required: ['beginning', 'middle', 'end'],
                additionalProperties: false,
              },
            },
            required: ['title', 'setting', 'characters', 'plot'],
            additionalProperties: false,
          },
        },
      },
    },
  });

  // Test the provider with a prompt
  try {
    console.log('Calling OpenAI Responses API with JSON Schema...');
    const result = await provider.callApi(
      'Create a short story about a magical forest with a beginning, middle, and end. Include a title, setting, main characters, and plot.',
    );

    console.log('Result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.error) {
      console.error('Error:', result.error);
    } else {
      console.log('Success! JSON Schema output:');
      console.log(typeof result.output === 'string' ? JSON.parse(result.output) : result.output);
    }
  } catch (error) {
    console.error('Exception caught:', error);
  }
}

// Run the test
testJsonSchema().catch(console.error);
