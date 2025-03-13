/**
 * Example transform function for SageMaker endpoints
 * This file demonstrates different ways to transform prompts for SageMaker models
 */

/**
 * Format a prompt for a JumpStart Llama model
 * @param {string} prompt The raw prompt text
 * @param {object} options Optional configuration parameters
 * @returns {object} Formatted payload for JumpStart Llama
 */
function formatLlamaPayload(prompt, options = {}) {
  return {
    inputs: prompt,
    parameters: {
      max_new_tokens: options.maxTokens || 256,
      temperature: options.temperature || 0.7,
      top_p: options.topP || 0.9,
      do_sample: true
    }
  };
}

/**
 * Format a prompt for a Hugging Face Mistral model
 * @param {string} prompt The raw prompt text
 * @param {object} options Optional configuration parameters
 * @returns {object} Formatted payload for Hugging Face Mistral
 */
function formatMistralPayload(prompt, options = {}) {
  return {
    inputs: prompt,
    parameters: {
      max_new_tokens: options.maxTokens || 256,
      temperature: options.temperature || 0.7,
      top_p: options.topP || 0.9,
      do_sample: true,
      return_full_text: false
    }
  };
}

/**
 * Format a generic prompt with common model parameters
 * Uses property shorthand for clean code
 * @param {string} prompt The raw prompt text
 * @param {object} context Contains variables and configuration
 * @returns {object} Formatted payload
 */
function formatGenericPayload(prompt, context) {
  // Extract options from context
  const options = context?.vars || {};
  const maxTokens = options.maxTokens || 256;
  const temperature = options.temperature || 0.7;
  const topP = options.topP || 0.9;
  
  return {
    prompt,
    max_tokens: maxTokens,
    temperature,
    top_p: topP
  };
}

// Export all transform functions
module.exports = {
  formatLlamaPayload,
  formatMistralPayload,
  formatGenericPayload
};