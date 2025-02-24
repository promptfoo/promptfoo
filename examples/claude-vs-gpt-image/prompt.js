/**
 * Image Analysis Example
 *
 * This example demonstrates how to format prompts for different AI providers
 * when performing image analysis tasks.
 *
 * Note: For simplicity and to avoid dependencies, this example uses the built-in
 * 'https' module. In a production environment, use more robust libraries like
 * axios for better error handling and features.
 */

const https = require('https');

// The system prompt that instructs the AI model
const systemPrompt = 'Describe the image in a few words';

/**
 * Fetches an image from a URL and converts it to a base64 string.
 * This is required for many providers like Anthropic and llava (via ollama, llama.cpp, etc.)
 *
 * @param {string} imageUrl - The URL of the image to fetch
 * @returns {Promise<string>} A promise that resolves with the base64-encoded image data
 */
function getImageBase64(imageUrl) {
  return new Promise((resolve, reject) => {
    https
      .get(imageUrl, (response) => {
        const data = [];
        response.on('data', (chunk) => {
          data.push(chunk);
        });
        response.on('end', () => {
          const buffer = Buffer.concat(data);
          resolve(buffer.toString('base64'));
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

/**
 * Formats the prompt based on the AI provider.
 *
 * @param {Object} context - The context object containing provider information and variables
 * @param {Object} context.provider - Information about the AI provider
 * @param {string} context.provider.id - The ID of the AI provider
 * @param {string} context.provider.label - The label of the AI provider
 * @param {Object} context.vars - Variables passed to the function
 * @param {string} context.vars.image_url - The URL of the image to analyze
 * @returns {Promise<Array>} A promise that resolves with the formatted prompt
 * @throws {Error} If an unsupported provider is specified
 */
async function formatImagePrompt(context) {
  // The ID always exists
  if (
    context.provider.id.startsWith('bedrock:anthropic') ||
    context.provider.id === 'anthropic:messages:claude-3-5-sonnet-20241022'
  ) {
    return [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: await getImageBase64(context.vars.image_url),
            },
          },
        ],
      },
    ];
  }
  // We can use the label if provided in the config.
  if (context.provider.label === 'custom label for gpt-4o') {
    return [
      {
        role: 'system',
        content: [{ type: 'text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: context.vars.image_url,
            },
          },
        ],
      },
    ];
  }
  throw new Error(`Unsupported provider: ${JSON.stringify(context.provider)}`);
}

module.exports = { formatImagePrompt };
