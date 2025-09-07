/**
 * Utility functions shared between Google AI Studio and Vertex AI providers
 */

/**
 * Calculate cost based on Google's Gemini model pricing
 * @param modelName - The name of the model
 * @param totalTokens - Total tokens used
 * @returns Cost in USD
 */
export function calculateGeminiCost(modelName: string, totalTokens: number): number {
  // Cost calculation based on Google's pricing
  // For image generation models like gemini-2.5-flash-image: $30 per 1M output tokens
  // For regular text models: varies by model (e.g., gemini-2.5-flash: $0.30 input, $2.50 output)

  if (modelName.includes('gemini-2.5-flash-image')) {
    // Image generation: $30 per 1M tokens (all output tokens)
    return (totalTokens / 1000000) * 30.0;
  }

  if (modelName.includes('gemini-1.5-pro')) {
    // Input: $3.50 per 1M tokens, Output: $10.50 per 1M tokens
    // Note: This is a simplified calculation assuming all tokens are output tokens
    return (totalTokens / 1000000) * 10.5;
  }

  if (modelName.includes('gemini-1.5-flash')) {
    // Input: $0.075 per 1M tokens, Output: $0.30 per 1M tokens
    // Note: This is a simplified calculation assuming all tokens are output tokens
    return (totalTokens / 1000000) * 0.3;
  }

  if (modelName.includes('gemini-2.5-flash')) {
    // Assume average of input ($0.30) and output ($2.50) pricing
    return (totalTokens / 1000000) * 1.4; // Conservative estimate
  }

  if (modelName.includes('gemini-2.5-pro')) {
    // Pro model pricing (varies by region, using standard pricing)
    return (totalTokens / 1000000) * 3.5; // Conservative estimate
  }

  // Default fallback for unknown models
  return (totalTokens / 1000000) * 2.0;
}

/**
 * Configure request body for image generation if needed
 * @param modelName - The name of the model
 * @param body - Request body to modify
 */
export function configureImageGeneration(modelName: string, body: any): void {
  // Enable image generation for Gemini 2.5 Flash Image models
  if (modelName.includes('gemini-2.5-flash-image')) {
    // Allow both text and image responses for image generation models
    body.generationConfig = body.generationConfig || {};
    body.generationConfig.responseModalities = ['IMAGE', 'TEXT'];
  }
}