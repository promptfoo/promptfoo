/**
 * Example transform function for SageMaker provider
 * 
 * This file demonstrates how to create a transform function that can be used
 * with the SageMaker provider to modify prompts before they're sent to the endpoint.
 * 
 * You can reference this file in your promptfoo configuration:
 * transform: file://transform.js
 */

/**
 * Transform function that formats a prompt for a specific model format
 * 
 * @param {string} prompt - The original prompt text
 * @param {object} context - Context object with provider configuration and other metadata
 * @returns {string|object} - The transformed prompt (string or object depending on endpoint requirements)
 */
module.exports = function(prompt, context) {
  console.log('Transforming prompt for SageMaker endpoint...');
  
  // Get configuration values
  const modelType = context.config?.modelType || 'custom';
  const maxTokens = context.config?.maxTokens || 256;
  const temperature = context.config?.temperature || 0.7;
  const topP = context.config?.topP || 0.9;
  
  // Example: Different transformations based on model type
  switch(modelType) {
    case 'llama':
      // Format for Llama models
      return `<s>[INST] ${prompt} [/INST]`;
      
    case 'anthropic':
      // Format for Claude models
      return `\n\nHuman: ${prompt}\n\nAssistant:`;
      
    case 'jumpstart':
      // Format as a complete JSON object for JumpStart models
      return {
        inputs: prompt,
        parameters: {
          max_new_tokens: maxTokens,
          temperature: temperature,
          top_p: topP,
          do_sample: true
        }
      };
      
    case 'custom':
      // Add a system instruction prefix
      return `SYSTEM: Act as a helpful and concise assistant. Keep responses factual and accurate.
USER: ${prompt}`;
      
    default:
      // For other models, just return the prompt unmodified
      return prompt;
  }
};