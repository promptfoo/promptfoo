import yaml from 'js-yaml';
import { getEnvBool, getEnvInt } from '../envars';

export const REQUEST_TIMEOUT_MS = getEnvInt('REQUEST_TIMEOUT_MS', 300_000);

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
      if (
        getEnvBool('PROMPTFOO_REQUIRE_JSON_PROMPTS') ||
        trimmedPrompt.startsWith('{') ||
        trimmedPrompt.startsWith('[')
      ) {
        throw new Error(`Chat Completion prompt is not a valid JSON string: ${err}\n\n${prompt}`);
      }
      // Fall back to the provided default value
      return defaultValue;
    }
  }
}

export function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

interface ModelCost {
  input: number;
  output: number;
}

interface ProviderModel {
  id: string;
  cost?: ModelCost;
}

interface ProviderConfig {
  cost?: number;
}

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
