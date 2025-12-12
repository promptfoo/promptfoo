/**
 * Groq-specific utility functions shared between Chat and Responses providers.
 */

/**
 * Groq reasoning models that support extended thinking capabilities.
 * These models include DeepSeek R1 variants, OpenAI GPT-OSS, and Qwen models.
 */
const GROQ_REASONING_MODEL_PATTERNS = ['deepseek-r1', 'gpt-oss', 'qwen'] as const;

/**
 * Check if a model name corresponds to a Groq reasoning model.
 * Groq's reasoning models include DeepSeek R1, GPT-OSS, and Qwen variants.
 */
export function isGroqReasoningModel(modelName: string): boolean {
  return GROQ_REASONING_MODEL_PATTERNS.some((pattern) => modelName.includes(pattern));
}

/**
 * Check if a Groq model supports temperature configuration.
 * Unlike some reasoning models (e.g., o1), Groq's reasoning models
 * (DeepSeek R1, GPT-OSS, Qwen) support temperature settings.
 */
export function groqSupportsTemperature(modelName: string): boolean {
  return isGroqReasoningModel(modelName);
}
