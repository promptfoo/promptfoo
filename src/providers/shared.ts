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
// Normalized Tool Choice
// ==================

/**
 * Provider-agnostic tool choice format.
 * Providers transform this to their native format.
 */
export interface NormalizedToolChoice {
  /**
   * - 'auto': Model decides whether to call a tool
   * - 'none': Model cannot call any tools
   * - 'required': Model must call at least one tool
   * - 'tool': Model must call the specific tool named in toolName
   */
  mode: 'auto' | 'none' | 'required' | 'tool';
  /** Required when mode is 'tool' */
  toolName?: string;
}

export type ToolChoiceFormat = 'openai' | 'anthropic' | 'bedrock' | 'google';

/**
 * Checks if the given object is a NormalizedToolChoice.
 */
export function isNormalizedToolChoice(obj: unknown): obj is NormalizedToolChoice {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const candidate = obj as Record<string, unknown>;
  return (
    typeof candidate.mode === 'string' &&
    ['auto', 'none', 'required', 'tool'].includes(candidate.mode)
  );
}

/**
 * Transforms a NormalizedToolChoice to OpenAI format.
 */
export function normalizedToolChoiceToOpenAI(
  choice: NormalizedToolChoice,
): string | { type: string; function?: { name: string } } {
  switch (choice.mode) {
    case 'auto':
      return 'auto';
    case 'none':
      return 'none';
    case 'required':
      return 'required';
    case 'tool':
      if (!choice.toolName) {
        throw new Error('toolName is required when mode is "tool"');
      }
      return { type: 'function', function: { name: choice.toolName } };
  }
}

/**
 * Transforms a NormalizedToolChoice to Anthropic format.
 */
export function normalizedToolChoiceToAnthropic(
  choice: NormalizedToolChoice,
): { type: string; name?: string } {
  switch (choice.mode) {
    case 'auto':
      return { type: 'auto' };
    case 'none':
      // Anthropic doesn't have 'none', closest is not sending tool_choice
      return { type: 'auto' };
    case 'required':
      return { type: 'any' };
    case 'tool':
      if (!choice.toolName) {
        throw new Error('toolName is required when mode is "tool"');
      }
      return { type: 'tool', name: choice.toolName };
  }
}

/**
 * Transforms a NormalizedToolChoice to Bedrock Converse format.
 */
export function normalizedToolChoiceToBedrock(
  choice: NormalizedToolChoice,
): { auto: object } | { any: object } | { tool: { name: string } } | undefined {
  switch (choice.mode) {
    case 'auto':
      return { auto: {} };
    case 'none':
      // Bedrock doesn't have 'none', return undefined to omit toolChoice
      return undefined;
    case 'required':
      return { any: {} };
    case 'tool':
      if (!choice.toolName) {
        throw new Error('toolName is required when mode is "tool"');
      }
      return { tool: { name: choice.toolName } };
  }
}

/**
 * Transforms a NormalizedToolChoice to Google (Gemini) format.
 */
export function normalizedToolChoiceToGoogle(
  choice: NormalizedToolChoice,
): { functionCallingConfig: { mode: string; allowedFunctionNames?: string[] } } | undefined {
  switch (choice.mode) {
    case 'auto':
      return { functionCallingConfig: { mode: 'AUTO' } };
    case 'none':
      return { functionCallingConfig: { mode: 'NONE' } };
    case 'required':
      return { functionCallingConfig: { mode: 'ANY' } };
    case 'tool':
      if (!choice.toolName) {
        throw new Error('toolName is required when mode is "tool"');
      }
      return {
        functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [choice.toolName] },
      };
  }
}

/**
 * Transforms a NormalizedToolChoice to the specified provider format.
 * If the input is already in a native format (not NormalizedToolChoice), it's returned as-is.
 */
export function transformToolChoice(
  toolChoice: unknown,
  format: ToolChoiceFormat,
): unknown {
  // If not a normalized format, pass through as-is (backward compatibility)
  if (!isNormalizedToolChoice(toolChoice)) {
    return toolChoice;
  }

  switch (format) {
    case 'openai':
      return normalizedToolChoiceToOpenAI(toolChoice);
    case 'anthropic':
      return normalizedToolChoiceToAnthropic(toolChoice);
    case 'bedrock':
      return normalizedToolChoiceToBedrock(toolChoice);
    case 'google':
      return normalizedToolChoiceToGoogle(toolChoice);
    default:
      return toolChoice;
  }
}

// ==================
// Normalized Tools
// ==================

/**
 * Provider-agnostic tool format.
 * Providers transform this to their native format.
 *
 * The parameters field supports full JSON Schema, including nested objects,
 * arrays, enums, $defs, and other schema features.
 */
export interface NormalizedTool {
  name: string;
  description?: string;
  /**
   * JSON Schema for the tool's parameters.
   * Supports full JSON Schema draft-07 features.
   */
  parameters?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean | Record<string, unknown>;
    /** JSON Schema definitions for reuse */
    $defs?: Record<string, unknown>;
    /** Other JSON Schema properties */
    [key: string]: unknown;
  };
  /**
   * When true, enables strict schema validation (OpenAI/Anthropic).
   * Provider support:
   * - OpenAI: Guarantees output matches schema exactly
   * - Anthropic: Enables structured outputs beta feature
   * - Bedrock/Google: Ignored (not supported)
   */
  strict?: boolean;
}

/**
 * Checks if an array contains NormalizedTool objects.
 * Returns true if the first tool in the array matches the NormalizedTool structure.
 */
export function isNormalizedToolArray(tools: unknown): tools is NormalizedTool[] {
  if (!Array.isArray(tools) || tools.length === 0) {
    return false;
  }
  const first = tools[0];
  if (typeof first !== 'object' || first === null) {
    return false;
  }
  // NormalizedTool has 'name' at top level but NOT 'type' (which would be OpenAI format)
  // and NOT 'input_schema' (which would be Anthropic format)
  // and NOT 'toolSpec' (which would be Bedrock format)
  // and NOT 'functionDeclarations' (which would be Google format)
  return (
    'name' in first &&
    typeof (first as Record<string, unknown>).name === 'string' &&
    !('type' in first) &&
    !('input_schema' in first) &&
    !('toolSpec' in first) &&
    !('functionDeclarations' in first)
  );
}

/**
 * OpenAI tool format
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
  /** Enables structured outputs beta feature */
  strict?: boolean;
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
 * Transforms NormalizedTool array to OpenAI format.
 */
export function normalizedToolsToOpenAI(tools: NormalizedTool[]): OpenAITool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      ...(tool.parameters ? { parameters: tool.parameters } : {}),
      ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
    },
  }));
}

/**
 * Transforms NormalizedTool array to Anthropic format.
 */
export function normalizedToolsToAnthropic(tools: NormalizedTool[]): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    input_schema: tool.parameters || { type: 'object', properties: {} },
    ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
  }));
}

/**
 * Transforms NormalizedTool array to Bedrock Converse format.
 */
export function normalizedToolsToBedrock(tools: NormalizedTool[]): BedrockTool[] {
  return tools.map((tool) => ({
    toolSpec: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      inputSchema: {
        json: tool.parameters || { type: 'object', properties: {} },
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
 * Transforms NormalizedTool array to Google/Gemini format.
 */
export function normalizedToolsToGoogle(tools: NormalizedTool[]): GoogleTool[] {
  const functionDeclarations = tools.map((tool) => ({
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    ...(tool.parameters
      ? { parameters: sanitizeSchemaForGoogle(tool.parameters as Record<string, unknown>) }
      : {}),
  }));
  return [{ functionDeclarations }];
}

export type ToolFormat = 'openai' | 'anthropic' | 'bedrock' | 'google';

/**
 * Transforms tools to the specified provider format.
 * If the input is already in a native format (not NormalizedTool), it's returned as-is.
 */
export function transformTools(tools: unknown, format: ToolFormat): unknown {
  // If not a normalized format, pass through as-is (backward compatibility)
  if (!isNormalizedToolArray(tools)) {
    return tools;
  }

  switch (format) {
    case 'openai':
      return normalizedToolsToOpenAI(tools);
    case 'anthropic':
      return normalizedToolsToAnthropic(tools);
    case 'bedrock':
      return normalizedToolsToBedrock(tools);
    case 'google':
      return normalizedToolsToGoogle(tools);
    default:
      return tools;
  }
}
