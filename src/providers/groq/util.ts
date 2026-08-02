/**
 * Groq-specific utility functions shared between Chat and Responses providers.
 */

/**
 * Groq reasoning models that support extended thinking capabilities.
 * These models include OpenAI GPT-OSS and current Qwen-based models.
 */
const GROQ_REASONING_MODEL_PATTERNS = ['gpt-oss', 'qwen'] as const;

const GROQ_CHAT_SERVICE_TIERS = new Set(['auto', 'on_demand', 'flex', 'performance', null]);
const GROQ_RESPONSES_SERVICE_TIERS = new Set(['auto', 'default', 'flex']);

function assertGroqServiceTier(
  serviceTier: unknown,
  endpoint: 'Chat Completions' | 'Responses',
  supportedTiers: ReadonlySet<unknown>,
): void {
  if (serviceTier !== undefined && !supportedTiers.has(serviceTier)) {
    throw new Error(
      `Invalid Groq ${endpoint} service_tier ${JSON.stringify(serviceTier)}. ` +
        `Use one of: ${[...supportedTiers].map((tier) => JSON.stringify(tier)).join(', ')}.`,
    );
  }
}

export function assertGroqChatServiceTier(serviceTier: unknown): void {
  assertGroqServiceTier(serviceTier, 'Chat Completions', GROQ_CHAT_SERVICE_TIERS);
}

export function assertGroqResponsesServiceTier(serviceTier: unknown): void {
  assertGroqServiceTier(serviceTier, 'Responses', GROQ_RESPONSES_SERVICE_TIERS);
}

/**
 * Check if a model name corresponds to a Groq reasoning model.
 * Groq's reasoning models include GPT-OSS and current Qwen variants.
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
