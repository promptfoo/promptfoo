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

// ==================
// OpenAI Tool Choice (Canonical Format)
// ==================

/**
 * OpenAI-native tool choice format, used as the canonical representation.
 * Providers transform this to their native format.
 */
export type OpenAIToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

export type ToolChoiceFormat = 'openai' | 'anthropic' | 'bedrock' | 'google';

/**
 * Checks if the given value is an OpenAI tool choice format.
 * Detects string values ('auto', 'none', 'required') and
 * the object form ({ type: 'function', function: { name } }).
 */
export function isOpenAIToolChoice(obj: unknown): obj is OpenAIToolChoice {
  if (typeof obj === 'string') {
    return ['auto', 'none', 'required'].includes(obj);
  }
  if (typeof obj === 'object' && obj !== null) {
    const candidate = obj as Record<string, unknown>;
    if (
      candidate.type === 'function' &&
      typeof candidate.function === 'object' &&
      candidate.function !== null
    ) {
      const fn = candidate.function as Record<string, unknown>;
      return typeof fn.name === 'string';
    }
  }
  return false;
}

/**
 * Transforms an OpenAI tool choice to Anthropic format.
 */
export function openaiToolChoiceToAnthropic(choice: OpenAIToolChoice): {
  type: string;
  name?: string;
} {
  if (typeof choice === 'string') {
    switch (choice) {
      case 'auto':
        return { type: 'auto' };
      case 'none':
        // Anthropic doesn't have 'none', closest is not sending tool_choice
        return { type: 'auto' };
      case 'required':
        return { type: 'any' };
    }
  }
  return { type: 'tool', name: choice.function.name };
}

/**
 * Transforms an OpenAI tool choice to Bedrock Converse format.
 */
export function openaiToolChoiceToBedrock(
  choice: OpenAIToolChoice,
): { auto: object } | { any: object } | { tool: { name: string } } | undefined {
  if (typeof choice === 'string') {
    switch (choice) {
      case 'auto':
        return { auto: {} };
      case 'none':
        // Bedrock doesn't have 'none', return undefined to omit toolChoice
        return undefined;
      case 'required':
        return { any: {} };
    }
  }
  return { tool: { name: choice.function.name } };
}

/**
 * Transforms an OpenAI tool choice to Google (Gemini) format.
 */
export function openaiToolChoiceToGoogle(
  choice: OpenAIToolChoice,
): { functionCallingConfig: { mode: string; allowedFunctionNames?: string[] } } | undefined {
  if (typeof choice === 'string') {
    switch (choice) {
      case 'auto':
        return { functionCallingConfig: { mode: 'AUTO' } };
      case 'none':
        return { functionCallingConfig: { mode: 'NONE' } };
      case 'required':
        return { functionCallingConfig: { mode: 'ANY' } };
    }
  }
  return {
    functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [choice.function.name] },
  };
}

/**
 * Transforms an OpenAI tool choice to the specified provider format.
 * If the input is not in OpenAI format, it's returned as-is (native passthrough).
 */
export function transformToolChoice(toolChoice: unknown, format: ToolChoiceFormat): unknown {
  // If not OpenAI format, pass through as-is (native provider format)
  if (!isOpenAIToolChoice(toolChoice)) {
    return toolChoice;
  }

  switch (format) {
    case 'openai':
      return toolChoice;
    case 'anthropic':
      return openaiToolChoiceToAnthropic(toolChoice);
    case 'bedrock':
      return openaiToolChoiceToBedrock(toolChoice);
    case 'google':
      return openaiToolChoiceToGoogle(toolChoice);
    default:
      return toolChoice;
  }
}

// ==================
// Tool Format Transformation
// ==================

/**
 * OpenAI tool format.
 * This is the canonical format for tool definitions. Use `transformToolsFormat`
 * to convert OpenAI-format tools to other provider formats (Anthropic, Bedrock, Google).
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    /** Enables strict schema validation */
    strict?: boolean;
  };
}

/**
 * Anthropic tool format
 */
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

/**
 * Bedrock Converse tool format
 */
export interface BedrockTool {
  toolSpec: {
    name: string;
    description?: string;
    inputSchema: {
      json: Record<string, unknown>;
    };
  };
}

/**
 * Google tool format (array of function declarations)
 */
export interface GoogleTool {
  functionDeclarations: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
}

/**
 * Checks if an array contains OpenAI-format tools.
 * Returns true if the first tool has `type: 'function'` and `function.name`.
 */
export function isOpenAIToolArray(tools: unknown): tools is OpenAITool[] {
  if (!Array.isArray(tools) || tools.length === 0) {
    return false;
  }
  const first = tools[0];
  if (typeof first !== 'object' || first === null) {
    return false;
  }
  const candidate = first as Record<string, unknown>;
  return (
    candidate.type === 'function' &&
    typeof candidate.function === 'object' &&
    candidate.function !== null &&
    typeof (candidate.function as Record<string, unknown>).name === 'string'
  );
}

/**
 * Transforms OpenAI-format tools to Anthropic format.
 */
export function openaiToolsToAnthropic(tools: OpenAITool[]): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.function.name,
    ...(tool.function.description ? { description: tool.function.description } : {}),
    input_schema: tool.function.parameters || { type: 'object', properties: {} },
  }));
}

/**
 * Transforms OpenAI-format tools to Bedrock Converse format.
 */
export function openaiToolsToBedrock(tools: OpenAITool[]): BedrockTool[] {
  return tools.map((tool) => ({
    toolSpec: {
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      inputSchema: {
        json: tool.function.parameters || { type: 'object', properties: {} },
      },
    },
  }));
}

/**
 * Sanitizes a schema for Google/Gemini compatibility.
 * - Converts type strings to uppercase (string → STRING)
 * - Removes unsupported properties (additionalProperties, $schema, default)
 * - Recursively processes nested schemas
 */
function sanitizeSchemaForGoogle(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    // Skip unsupported properties
    if (['additionalProperties', '$schema', 'default', '$id', '$ref'].includes(key)) {
      continue;
    }

    if (key === 'type' && typeof value === 'string') {
      // Convert type to uppercase
      result[key] = value.toUpperCase();
    } else if (key === 'properties' && typeof value === 'object' && value !== null) {
      // Recursively sanitize properties
      const sanitizedProps: Record<string, unknown> = {};
      for (const [propKey, propValue] of Object.entries(value as Record<string, unknown>)) {
        if (typeof propValue === 'object' && propValue !== null) {
          sanitizedProps[propKey] = sanitizeSchemaForGoogle(propValue as Record<string, unknown>);
        } else {
          sanitizedProps[propKey] = propValue;
        }
      }
      result[key] = sanitizedProps;
    } else if (key === 'items' && typeof value === 'object' && value !== null) {
      // Recursively sanitize array items
      result[key] = sanitizeSchemaForGoogle(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Transforms OpenAI-format tools to Google/Gemini format.
 */
export function openaiToolsToGoogle(tools: OpenAITool[]): GoogleTool[] {
  const functionDeclarations = tools.map((tool) => ({
    name: tool.function.name,
    ...(tool.function.description ? { description: tool.function.description } : {}),
    ...(tool.function.parameters
      ? { parameters: sanitizeSchemaForGoogle(tool.function.parameters) }
      : {}),
  }));
  return [{ functionDeclarations }];
}

export type ToolFormat = 'openai' | 'anthropic' | 'bedrock' | 'google';

/**
 * Transforms tools from OpenAI format to the specified provider format.
 * If the input is not in OpenAI format, it's returned as-is.
 */
export function transformTools(tools: unknown, format: ToolFormat): unknown {
  // If not OpenAI format, pass through as-is
  if (!isOpenAIToolArray(tools)) {
    return tools;
  }

  switch (format) {
    case 'openai':
      return tools; // Already in OpenAI format
    case 'anthropic':
      return openaiToolsToAnthropic(tools);
    case 'bedrock':
      return openaiToolsToBedrock(tools);
    case 'google':
      return openaiToolsToGoogle(tools);
    default:
      return tools;
  }
}
