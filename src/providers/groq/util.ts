/**
 * Groq-specific utility functions shared between Chat and Responses providers.
 */

/**
 * Groq reasoning models that support extended thinking capabilities.
 * These models include OpenAI GPT-OSS and current Qwen-based models.
 */
const GROQ_REASONING_MODEL_PATTERNS = ['gpt-oss', 'qwen'] as const;

/**
 * Check if a model name corresponds to a Groq reasoning model.
 * Groq's reasoning models include GPT-OSS and current Qwen variants, including
 * the still-supported DeepSeek-R1-Distill-Qwen model.
 */
export function isGroqReasoningModel(modelName: string): boolean {
  return GROQ_REASONING_MODEL_PATTERNS.some((pattern) => modelName.includes(pattern));
}

/**
 * Check whether a Groq reasoning model supports temperature configuration.
 * Regular Groq chat models are handled by the parent provider; this helper only
 * captures the reasoning-model exception path used by the Groq subclasses.
 */
export function groqSupportsTemperature(modelName: string): boolean {
  return isGroqReasoningModel(modelName);
}
