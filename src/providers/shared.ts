import yaml from 'js-yaml';
import { getEnvBool, getEnvInt } from '../envars';

import type { ApiProvider } from '../types/index';

/**
 * The default timeout for API requests in milliseconds.
 */
export const REQUEST_TIMEOUT_MS = getEnvInt('REQUEST_TIMEOUT_MS', 300_000);

/**
 * Extended timeout for long-running models (deep research, gpt-5-pro, etc.) in milliseconds.
 * These models can take significantly longer to respond due to their complex reasoning.
 */
export const LONG_RUNNING_MODEL_TIMEOUT_MS = 600_000; // 10 minutes

interface ModelCost {
  input: number;
  output: number;
  audioInput?: number;
  audioOutput?: number;
}

interface ProviderModel {
  id: string;
  cost?: ModelCost;
}

export interface ProviderConfig {
  cost?: number;
  audioCost?: number;
}

/**
 * Calculates the cost of an API call based on the model and token usage.
 *
 * @param {string} modelName The name of the model used.
 * @param {ProviderConfig} config The provider configuration.
 * @param {number | undefined} promptTokens The number of tokens in the prompt.
 * @param {number | undefined} completionTokens The number of tokens in the completion.
 * @param {ProviderModel[]} models An array of available models with their costs.
 * @returns {number | undefined} The calculated cost, or undefined if it can't be calculated.
 */
export function calculateCost(
  modelName: string,
  config: ProviderConfig,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  models: ProviderModel[],
): number | undefined {
  if (
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens) ||
    typeof promptTokens === 'undefined' ||
    typeof completionTokens === 'undefined'
  ) {
    return undefined;
  }

  const model = models.find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return undefined;
  }

  const inputCost = config.cost ?? model.cost.input;
  const outputCost = config.cost ?? model.cost.output;
  return inputCost * promptTokens + outputCost * completionTokens || undefined;
}

/**
 * Checks if a string looks like it's attempting to be JSON.
 * This helps distinguish between actual JSON attempts and plain text that happens to start/end with brackets.
 */
function looksLikeJson(prompt: string): boolean {
  const trimmed = prompt.trim();

  // Objects starting with { are almost always JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return true;
  }

  // Arrays starting with [ need more careful checking
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    // Check if the character after [ suggests it's JSON
    // Valid JSON array starts: ", {, [, whitespace, number, or true/false/null
    const afterBracket = trimmed.slice(1).trimStart();
    if (
      afterBracket.startsWith('"') ||
      afterBracket.startsWith('{') ||
      afterBracket.startsWith('[') ||
      /^[\d-]/.test(afterBracket) || // number
      /^(true|false|null)/.test(afterBracket) // boolean or null
    ) {
      return true;
    }
    // If it's just whitespace or empty, it might be JSON
    if (afterBracket.length === 0 || /^\s+$/.test(afterBracket)) {
      return true;
    }
    // Otherwise, it's likely plain text (e.g., [INST]...[/INST])
    return false;
  }

  return false;
}

/**
 * Parses a chat prompt string into a structured format.
 *
 * @template T The expected return type of the parsed prompt.
 * @param {string} prompt The input prompt string to parse.
 * @param {T} defaultValue The default value to return if parsing fails.
 * @returns {T} The parsed prompt or the default value.
 * @throws {Error} If the prompt is invalid YAML or JSON (when required).
 */
export function parseChatPrompt<T>(prompt: string, defaultValue: T): T {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.startsWith('- role:')) {
    try {
      // Try YAML - some legacy OpenAI prompts are YAML :(
      return yaml.load(prompt) as T;
    } catch (err) {
      throw new Error(`Chat Completion prompt is not a valid YAML string: ${err}\n\n${prompt}`);
    }
  } else {
    try {
      // Try JSON
      return JSON.parse(prompt) as T;
    } catch (err) {
      if (getEnvBool('PROMPTFOO_REQUIRE_JSON_PROMPTS') || looksLikeJson(trimmedPrompt)) {
        throw new Error(`Chat Completion prompt is not a valid JSON string: ${err}\n\n${prompt}`);
      }
      // Fall back to the provided default value
      return defaultValue;
    }
  }
}

/**
 * Converts a string to title case.
 *
 * @param {string} str The input string to convert.
 * @returns {string} The input string converted to title case.
 */
export function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export function isPromptfooSampleTarget(provider: ApiProvider) {
  const url = provider.config?.url;
  return url?.includes('promptfoo.app') || url?.includes('promptfoo.dev');
}
