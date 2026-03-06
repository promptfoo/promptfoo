/**
 * Image Analysis Example
 *
 * This example demonstrates how to format prompts for different AI providers
 * when performing image analysis tasks.
 */

// The system prompt that instructs the AI model
const systemPrompt = 'Describe the image in a few words';

/**
 * Fetches an image from a URL and converts it to a base64 string.
 * This is required for many providers like Anthropic and llava (via ollama, llama.cpp, etc.)
 *
 * @param {string} imageUrl - The URL of the image to fetch
 * @returns {Promise<{base64: string, mediaType: string}>} A promise that resolves with the base64-encoded image data and media type
 */
async function getImageBase64(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = await response.arrayBuffer();
  return {
    base64: Buffer.from(buffer).toString('base64'),
    mediaType: contentType.split(';')[0], // Remove charset if present
  };
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
    context.provider.id.startsWith('bedrock:us.anthropic') ||
    context.provider.id.startsWith('anthropic:')
  ) {
    const image = await getImageBase64(context.vars.image_url);
    return [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: image.mediaType,
              data: image.base64,
            },
          },
        ],
      },
    ];
  }
  if (context.provider.id.startsWith('google:gemini')) {
    const image = await getImageBase64(context.vars.image_url);
    return [
      {
        parts: [
          {
            inline_data: {
              mime_type: image.mediaType,
              data: image.base64,
            },
          },
          { text: systemPrompt },
        ],
      },
    ];
  }
  // We can use the label if provided in the config.
  if (context.provider.label === 'custom label for gpt-4.1') {
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
