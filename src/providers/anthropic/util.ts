import { parseDataUrl } from '../../util/dataUrl';
import { calculateCost as calculateCostBase } from '../shared';
import type Anthropic from '@anthropic-ai/sdk';

import type { TokenUsage } from '../../types/index';
import type {
  AnthropicToolConfig,
  WebFetchToolConfig,
  WebFetchToolConfig20260209,
  WebFetchToolConfigV2,
  WebSearchToolConfig,
  WebSearchToolConfig20260209,
} from './types';

// Model definitions with cost information
export const ANTHROPIC_MODELS = [
  // Claude 4.6 models - Latest generation
  ...['claude-sonnet-4-6', 'claude-sonnet-4-6-latest'].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6, // $3 / MTok
      output: 15 / 1e6, // $15 / MTok
    },
  })),
  ...['claude-opus-4-6', 'claude-opus-4-6-latest'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1e6, // $5 / MTok
      output: 25 / 1e6, // $25 / MTok
    },
  })),
  ...['claude-opus-4-5', 'claude-opus-4-5-20251101', 'claude-opus-4-5-latest'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1e6, // $5 / MTok
      output: 25 / 1e6, // $25 / MTok
    },
  })),
  ...[
    'claude-opus-4-1',
    'claude-opus-4-1-20250805',
    'claude-opus-4-20250514',
    'claude-opus-4-0',
    'claude-opus-4-latest',
  ].map((model) => ({
    id: model,
    cost: {
      input: 15 / 1e6, // $15 / MTok
      output: 75 / 1e6, // $75 / MTok
    },
  })),
  ...[
    'claude-sonnet-4-5',
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-5-latest',
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-0',
    'claude-sonnet-4-latest',
  ].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6, // $3 / MTok
      output: 15 / 1e6, // $15 / MTok
    },
  })),
  ...['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-haiku-4-5-latest'].map((model) => ({
    id: model,
    cost: {
      input: 1 / 1e6, // $1 / MTok
      output: 5 / 1e6, // $5 / MTok
    },
  })),

  // NOTE: Claude 2.x models are deprecated and will be retired on July 21, 2025.
  ...['claude-2.0'].map((model) => ({
    id: model,
    cost: {
      input: 0.008 / 1000,
      output: 0.024 / 1000,
    },
  })),
  ...['claude-2.1'].map((model) => ({
    id: model,
    cost: {
      input: 0.008 / 1000,
      output: 0.024 / 1000,
    },
  })),
  ...['claude-3-haiku-20240307', 'claude-3-haiku-latest'].map((model) => ({
    id: model,
    cost: {
      input: 0.00025 / 1000,
      output: 0.00125 / 1000,
    },
  })),
  ...['claude-3-opus-20240229', 'claude-3-opus-latest'].map((model) => ({
    id: model,
    cost: {
      input: 0.015 / 1000,
      output: 0.075 / 1000,
    },
  })),
  ...['claude-3-5-haiku-20241022', 'claude-3-5-haiku-latest'].map((model) => ({
    id: model,
    cost: {
      input: 0.8 / 1e6,
      output: 4 / 1e6,
    },
  })),
  ...[
    'claude-3-5-sonnet-20240620',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-latest',
    'claude-3-7-sonnet-20250219',
    'claude-3-7-sonnet-latest',
  ].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6,
      output: 15 / 1e6,
    },
  })),
];

export function outputFromMessage(message: Anthropic.Messages.Message, showThinking: boolean) {
  const hasToolUse = message.content.some((block) => block.type === 'tool_use');
  const hasThinking = message.content.some(
    (block) => block.type === 'thinking' || block.type === 'redacted_thinking',
  );

  if (hasToolUse || hasThinking) {
    return message.content
      .map((block) => {
        if (block.type === 'text') {
          return block.text;
        } else if (block.type === 'thinking' && showThinking) {
          return `Thinking: ${block.thinking}\nSignature: ${block.signature}`;
        } else if (block.type === 'redacted_thinking' && showThinking) {
          return `Redacted Thinking: ${block.data}`;
        } else if (block.type !== 'thinking' && block.type !== 'redacted_thinking') {
          return JSON.stringify(block);
        }
        return '';
      })
      .filter((text) => text !== '')
      .join('\n\n');
  }
  return message.content
    .map((block) => {
      return (block as Anthropic.Messages.TextBlock).text;
    })
    .join('\n\n');
}

/**
 * Automatically extracts base64 data from data URLs for Anthropic image content.
 * This ensures compatibility with our universal data URL generation without requiring
 * users to modify their prompt templates with Nunjucks filters.
 */
function processAnthropicImageContent(content: any[]): any[] {
  return content.map((item) => {
    if (item.type === 'image' && item.source && item.source.type === 'base64') {
      // Check if the data field contains a data URL and parse it
      const parsed = parseDataUrl(item.source.data);
      if (parsed) {
        return {
          ...item,
          source: {
            ...item.source,
            media_type: item.source.media_type || parsed.mimeType,
            data: parsed.base64Data,
          },
        };
      }
    }
    return item;
  });
}

export function parseMessages(messages: string): {
  system?: Anthropic.TextBlockParam[];
  extractedMessages: Anthropic.MessageParam[];
  thinking?: Anthropic.ThinkingConfigParam;
} {
  try {
    const parsed = JSON.parse(messages);
    if (Array.isArray(parsed)) {
      const systemMessage = parsed.find((msg) => msg.role === 'system');
      const thinking = parsed.find((msg) => msg.thinking)?.thinking;
      return {
        extractedMessages: parsed
          .filter((msg) => msg.role && msg.role !== 'system')
          .map((msg) => ({
            role: msg.role,
            content: Array.isArray(msg.content)
              ? processAnthropicImageContent(msg.content)
              : [{ type: 'text', text: msg.content }],
          })),
        system: systemMessage
          ? Array.isArray(systemMessage.content)
            ? systemMessage.content
            : [{ type: 'text', text: systemMessage.content }]
          : undefined,
        thinking,
      };
    }
  } catch {
    // Not JSON, parse as plain text
  }
  const lines = messages
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line);
  let system: Anthropic.TextBlockParam[] | undefined;
  let thinking: Anthropic.ThinkingConfigParam | undefined;
  const extractedMessages: Anthropic.MessageParam[] = [];
  let currentRole: 'user' | 'assistant' | null = null;
  let currentContent: string[] = [];

  const pushMessage = () => {
    if (currentRole && currentContent.length > 0) {
      extractedMessages.push({
        role: currentRole,
        content: [{ type: 'text', text: currentContent.join('\n') }],
      });
      currentContent = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith('system:')) {
      system = [{ type: 'text', text: line.slice(7).trim() }];
    } else if (line.startsWith('thinking:')) {
      try {
        thinking = JSON.parse(line.slice(9).trim());
      } catch {
        // Invalid thinking config, ignore
      }
    } else if (line.startsWith('user:') || line.startsWith('assistant:')) {
      pushMessage();
      currentRole = line.startsWith('user:') ? 'user' : 'assistant';
      currentContent.push(line.slice(line.indexOf(':') + 1).trim());
    } else if (currentRole) {
      currentContent.push(line);
    } else {
      // If no role is set, assume it's a user message
      currentRole = 'user';
      currentContent.push(line);
    }
  }

  pushMessage();

  if (extractedMessages.length === 0 && !system) {
    extractedMessages.push({
      role: 'user',
      content: [{ type: 'text', text: messages.trim() }],
    });
  }

  return { system, extractedMessages, thinking };
}

/**
 * Compute input cost with Anthropic cache pricing applied.
 * Anthropic docs: input_tokens is the non-cached portion; cache_read and cache_creation are additive.
 * Cache reads cost 10% of base rate (90% discount), cache writes cost 125% of base rate (25% surcharge).
 */
function calculateCacheInputCost(
  baseInputRate: number,
  uncachedInputTokens: number,
  cacheRead: number,
  cacheCreation: number,
): number {
  return (
    uncachedInputTokens * baseInputRate +
    cacheRead * baseInputRate * 0.1 +
    cacheCreation * baseInputRate * 1.25
  );
}

export function calculateAnthropicCost(
  modelName: string,
  config: any,
  promptTokens?: number,
  completionTokens?: number,
  cacheReadTokens?: number,
  cacheCreationTokens?: number,
): number | undefined {
  if (config.cost != null) {
    return calculateCostBase(modelName, config, promptTokens, completionTokens, ANTHROPIC_MODELS);
  }

  if (
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens) ||
    typeof promptTokens === 'undefined' ||
    typeof completionTokens === 'undefined'
  ) {
    return calculateCostBase(modelName, config, promptTokens, completionTokens, ANTHROPIC_MODELS);
  }

  const cacheRead = cacheReadTokens ?? 0;
  const cacheCreation = cacheCreationTokens ?? 0;

  // Anthropic docs: the >200k threshold considers input + cache read + cache creation tokens
  const effectiveInputTokens = promptTokens + cacheRead + cacheCreation;

  // Claude Sonnet models with 1M context support have tiered pricing based on prompt size
  const hasTieredPricing = [
    'claude-sonnet-4-5',
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-5-latest',
    'claude-sonnet-4-6',
    'claude-sonnet-4-6-latest',
  ].includes(modelName);

  if (hasTieredPricing) {
    const isLongContext = effectiveInputTokens > 200_000;
    const baseInputRate = isLongContext ? 6 / 1e6 : 3 / 1e6;
    const outputRate = isLongContext ? 22.5 / 1e6 : 15 / 1e6;

    return (
      calculateCacheInputCost(baseInputRate, promptTokens, cacheRead, cacheCreation) +
      completionTokens * outputRate
    );
  }

  // For non-tiered models, apply cache pricing only when cache tokens are present
  if (cacheRead || cacheCreation) {
    const modelInfo = ANTHROPIC_MODELS.find((m) => m.id === modelName);
    if (modelInfo) {
      return (
        calculateCacheInputCost(modelInfo.cost.input, promptTokens, cacheRead, cacheCreation) +
        completionTokens * modelInfo.cost.output
      );
    }
  }

  return calculateCostBase(modelName, config, promptTokens, completionTokens, ANTHROPIC_MODELS);
}

export function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    // Anthropic: total input = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
    const cacheRead = data.usage.cache_read_input_tokens ?? 0;
    const cacheCreation = data.usage.cache_creation_input_tokens ?? 0;
    const allInputTokens = (data.usage.input_tokens ?? 0) + cacheRead + cacheCreation;
    const total_tokens = allInputTokens + (data.usage.output_tokens ?? 0);

    if (cached) {
      return { cached: total_tokens, total: total_tokens };
    } else {
      const usage: Partial<TokenUsage> = {
        total: total_tokens,
        prompt: allInputTokens,
        completion: data.usage.output_tokens ?? 0,
      };

      // Track Anthropic prompt caching details (stored in completionDetails since there is no dedicated inputDetails field)
      if (
        data.usage.cache_read_input_tokens != null ||
        data.usage.cache_creation_input_tokens != null
      ) {
        usage.completionDetails = {
          cacheReadInputTokens: cacheRead,
          cacheCreationInputTokens: cacheCreation,
        };
      }

      return usage;
    }
  }
  return {};
}

/**
 * Processes tools configuration to handle web fetch and web search tools
 */
export function processAnthropicTools(tools: (Anthropic.Tool | AnthropicToolConfig)[] = []): {
  processedTools: (
    | Anthropic.Tool
    | Anthropic.Beta.Messages.BetaWebFetchTool20250910
    | Anthropic.Messages.WebFetchTool20260209
    | Anthropic.Messages.WebFetchTool20260309
    | Anthropic.Beta.Messages.BetaWebSearchTool20250305
    | Anthropic.Messages.WebSearchTool20260209
  )[];
  requiredBetaFeatures: string[];
} {
  const processedTools: (
    | Anthropic.Tool
    | Anthropic.Beta.Messages.BetaWebFetchTool20250910
    | Anthropic.Messages.WebFetchTool20260209
    | Anthropic.Messages.WebFetchTool20260309
    | Anthropic.Beta.Messages.BetaWebSearchTool20250305
    | Anthropic.Messages.WebSearchTool20260209
  )[] = [];
  const requiredBetaFeatures: string[] = [];

  const addRequiredBetaFeature = (feature: string) => {
    if (!requiredBetaFeatures.includes(feature)) {
      requiredBetaFeatures.push(feature);
    }
  };

  for (const tool of tools) {
    if ('type' in tool) {
      // Handle our custom tool configs
      if (tool.type === 'web_fetch_20250910') {
        processedTools.push(transformWebFetchTool(tool as WebFetchToolConfig));
        addRequiredBetaFeature('web-fetch-2025-09-10');
      } else if (tool.type === 'web_fetch_20260209') {
        processedTools.push(transformWebFetchTool20260209(tool as WebFetchToolConfig20260209));
      } else if (tool.type === 'web_fetch_20260309') {
        processedTools.push(transformWebFetchToolV2(tool as WebFetchToolConfigV2));
      } else if (tool.type === 'web_search_20250305') {
        processedTools.push(transformWebSearchTool(tool as WebSearchToolConfig));
        // Web search doesn't need beta header in latest SDK
      } else if (tool.type === 'web_search_20260209') {
        processedTools.push(transformWebSearchTool20260209(tool as WebSearchToolConfig20260209));
        // Web search doesn't need beta header in latest SDK
      } else {
        // Pass through other tool types (standard Anthropic tools)
        processedTools.push(tool as Anthropic.Tool);
      }
    } else {
      // Standard Anthropic tool
      processedTools.push(tool as Anthropic.Tool);
    }

    // Check if tool uses strict mode (structured outputs for tools)
    if ('strict' in tool && tool.strict === true) {
      addRequiredBetaFeature('structured-outputs-2025-11-13');
    }
  }

  return { processedTools, requiredBetaFeatures };
}

/**
 * Apply shared web fetch tool fields from config onto the SDK tool object.
 */
function applyWebFetchFields(
  tool:
    | Anthropic.Beta.Messages.BetaWebFetchTool20250910
    | Anthropic.Messages.WebFetchTool20260209
    | Anthropic.Messages.WebFetchTool20260309,
  config: WebFetchToolConfig | WebFetchToolConfig20260209 | WebFetchToolConfigV2,
): void {
  if (config.allowed_callers !== undefined) {
    tool.allowed_callers = config.allowed_callers;
  }
  if (config.max_uses !== undefined) {
    tool.max_uses = config.max_uses;
  }
  if (config.allowed_domains !== undefined) {
    tool.allowed_domains = config.allowed_domains;
  }
  if (config.blocked_domains !== undefined) {
    tool.blocked_domains = config.blocked_domains;
  }
  if (config.citations !== undefined) {
    tool.citations = config.citations;
  }
  if (config.max_content_tokens !== undefined) {
    tool.max_content_tokens = config.max_content_tokens;
  }
  if (config.cache_control !== undefined) {
    tool.cache_control = config.cache_control;
  }
  if (config.defer_loading !== undefined) {
    tool.defer_loading = config.defer_loading;
  }
  if (config.strict !== undefined) {
    tool.strict = config.strict;
  }
}

function transformWebFetchTool(
  config: WebFetchToolConfig,
): Anthropic.Beta.Messages.BetaWebFetchTool20250910 {
  const tool: Anthropic.Beta.Messages.BetaWebFetchTool20250910 = {
    type: 'web_fetch_20250910',
    name: 'web_fetch',
  };
  applyWebFetchFields(tool, config);
  return tool;
}

function transformWebFetchTool20260209(
  config: WebFetchToolConfig20260209,
): Anthropic.Messages.WebFetchTool20260209 {
  const tool: Anthropic.Messages.WebFetchTool20260209 = {
    type: 'web_fetch_20260209',
    name: 'web_fetch',
  };
  applyWebFetchFields(tool, config);
  return tool;
}

function transformWebFetchToolV2(
  config: WebFetchToolConfigV2,
): Anthropic.Messages.WebFetchTool20260309 {
  const tool: Anthropic.Messages.WebFetchTool20260309 = {
    type: 'web_fetch_20260309',
    name: 'web_fetch',
  };
  applyWebFetchFields(tool, config);
  if (config.use_cache !== undefined) {
    tool.use_cache = config.use_cache;
  }
  return tool;
}

function applyWebSearchFields(
  tool:
    | Anthropic.Beta.Messages.BetaWebSearchTool20250305
    | Anthropic.Messages.WebSearchTool20260209,
  config: WebSearchToolConfig | WebSearchToolConfig20260209,
): void {
  if (config.allowed_callers !== undefined) {
    tool.allowed_callers = config.allowed_callers;
  }
  if (config.allowed_domains !== undefined) {
    tool.allowed_domains = config.allowed_domains;
  }
  if (config.blocked_domains !== undefined) {
    tool.blocked_domains = config.blocked_domains;
  }
  if (config.cache_control !== undefined) {
    tool.cache_control = config.cache_control;
  }
  if (config.defer_loading !== undefined) {
    tool.defer_loading = config.defer_loading;
  }
  if (config.max_uses !== undefined) {
    tool.max_uses = config.max_uses;
  }
  if (config.strict !== undefined) {
    tool.strict = config.strict;
  }
  if (config.user_location !== undefined) {
    tool.user_location = config.user_location;
  }
}

/**
 * Transform web search tool config to Anthropic beta tool format
 */
function transformWebSearchTool(
  config: WebSearchToolConfig,
): Anthropic.Beta.Messages.BetaWebSearchTool20250305 {
  const tool: Anthropic.Beta.Messages.BetaWebSearchTool20250305 = {
    type: 'web_search_20250305',
    name: 'web_search',
  };
  applyWebSearchFields(tool, config);
  return tool;
}

function transformWebSearchTool20260209(
  config: WebSearchToolConfig20260209,
): Anthropic.Messages.WebSearchTool20260209 {
  const tool: Anthropic.Messages.WebSearchTool20260209 = {
    type: 'web_search_20260209',
    name: 'web_search',
  };
  applyWebSearchFields(tool, config);
  return tool;
}
