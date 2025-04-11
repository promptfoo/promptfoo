/**
 * Example transform function for SageMaker endpoints
 * This file demonstrates how to transform prompts for SageMaker models
 */

/**
 * Default export transformation function for SageMaker
 * This function will be used when importing this file without a specific function name
 *
 * @param {string|object} promptOrJson - The raw prompt text or JSON object from the response
 * @param {object} context - Contains configuration and variables
 * @returns {string|object} - Transformed prompt or processed response
 */
module.exports = function (promptOrJson, context) {
  // Check if this is being used for prompt transformation (input is a string)
  if (typeof promptOrJson === 'string') {
    // Format for a JumpStart model by default
    return {
      inputs: promptOrJson,
      parameters: {
        max_new_tokens: context?.config?.maxTokens || 256,
        temperature: context?.config?.temperature || 0.7,
        top_p: context?.config?.topP || 0.9,
        do_sample: true,
      },
    };
  }
  // Otherwise, this is being used for response transformation (input is a JSON object)
  else {
    // Extract the generated text from the response
    const generatedText =
      promptOrJson.generated_text ||
      (Array.isArray(promptOrJson) && promptOrJson[0]?.generated_text) ||
      promptOrJson.text ||
      promptOrJson;

    // Return the extracted text with additional metadata
    return {
      output: typeof generatedText === 'string' ? generatedText : JSON.stringify(generatedText),
      source: 'SageMaker',
      model_type: context?.config?.modelType || 'custom',
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Format a prompt for a JumpStart Llama model
 * @param {string} prompt The raw prompt text
 * @param {object} context Contains configuration details
 * @returns {object} Formatted payload for JumpStart Llama
 */
module.exports.formatLlamaPayload = function (prompt, context) {
  return {
    inputs: prompt,
    parameters: {
      max_new_tokens: context?.config?.maxTokens || 256,
      temperature: context?.config?.temperature || 0.7,
      top_p: context?.config?.topP || 0.9,
      do_sample: true,
    },
  };
};

/**
 * Format a prompt for a Hugging Face Mistral model
 * @param {string} prompt The raw prompt text
 * @param {object} context Contains configuration details
 * @returns {object} Formatted payload for Hugging Face Mistral
 */
module.exports.formatMistralPayload = function (prompt, context) {
  return {
    inputs: prompt,
    parameters: {
      max_new_tokens: context?.config?.maxTokens || 256,
      temperature: context?.config?.temperature || 0.7,
      top_p: context?.config?.topP || 0.9,
      do_sample: true,
      return_full_text: false,
    },
  };
};
