/**
 * Centralized default model constants.
 *
 * These are the models used internally for grading, suggestions, redteam generation, etc.
 * This is NOT the list of models shown in UI dropdowns - see defaultProviders.ts for that.
 */

// Anthropic default model for grading, suggestions, etc.
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';

// Full provider ID for UI defaults (used in target selectors)
export const DEFAULT_ANTHROPIC_PROVIDER_ID = `anthropic:messages:${DEFAULT_ANTHROPIC_MODEL}`;
