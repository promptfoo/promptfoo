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
  // Claude 5 models. These are pinned IDs, not `-latest` aliases.
  ...['claude-fable-5', 'claude-mythos-5'].map((model) => ({
    id: model,
    cost: {
      input: 10 / 1e6, // $10 / MTok
      output: 50 / 1e6, // $50 / MTok
    },
  })),
  // Claude Sonnet 5 — the most agentic Sonnet, with a 1M context window and effort
  // levels. Uses standard list pricing ($3/$15); the launch introductory pricing
  // ($2/$10, through Aug 31, 2026) is intentionally not encoded here. The full 1M
  // context bills at this flat rate — prompt size never changes the per-token price.
  ...['claude-sonnet-5'].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6, // $3 / MTok
      output: 15 / 1e6, // $15 / MTok
    },
  })),
  // Claude Mythos Preview - gated research preview for defensive cybersecurity (Project Glasswing)
  ...['claude-mythos-preview'].map((model) => ({
    id: model,
    cost: {
      input: 25 / 1e6, // $25 / MTok
      output: 125 / 1e6, // $125 / MTok
    },
  })),
  // Claude 4.8 models
  // NOTE: Anthropic publishes a single dateless ID for Opus 4.8 — the documented
  // Claude API alias is the canonical ID itself (`claude-opus-4-8`), so there is no
  // separate `-latest` pointer to register.
  ...['claude-opus-4-8'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1e6, // $5 / MTok
      output: 25 / 1e6, // $25 / MTok
    },
  })),
  // Claude 4.7 models
  // NOTE: Anthropic publishes a single alias-less ID for Opus 4.7 — the Models API
  // returns 404 for `claude-opus-4-7-latest`, so we intentionally only register the
  // canonical ID here.
  ...['claude-opus-4-7'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1e6, // $5 / MTok
      output: 25 / 1e6, // $25 / MTok
    },
  })),
  // Claude 4.6 models
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

// Model-ID matchers for each Claude family, across Anthropic, Bedrock (incl. the
// `us.`/`eu.`/`jp.`/`global.` inference-profile prefixes), Vertex, and Azure deployment
// names. The leading `(^|[^a-z0-9])` boundary and a trailing lookahead guard (`(?![0-9])`,
// or `(?![a-z0-9])` for the dateless Fable/Mythos IDs) keep a family from matching a longer
// neighbor (e.g. `claude-opus-4-80` is not Opus 4.8, and `claude-sonnet-4-5` is not Sonnet 5)
// while still matching dated snapshots like `claude-opus-4-8-20260528`.
const CLAUDE_FABLE_MYTHOS_5_PATTERN = /(^|[^a-z0-9])claude-(?:fable|mythos)-5(?![a-z0-9])/i;
const CLAUDE_SONNET_5_PATTERN = /(^|[^a-z0-9])claude-sonnet-5(?![0-9])/i;
const CLAUDE_OPUS_48_PATTERN = /(^|[^a-z0-9])claude-opus-4-8(?![0-9])/i;
const CLAUDE_OPUS_47_PATTERN = /(^|[^a-z0-9])claude-opus-4-7(?![0-9])/i;
// Opus/Sonnet 4.5 and 4.6, and Haiku 4.5 — regional premium only (no other deprecations).
const CLAUDE_4_5_AND_4_6_TIER_PATTERN =
  /(^|[^a-z0-9])claude-(?:opus|sonnet|haiku)-4-(?:5|6)(?![0-9])/i;

interface ClaudeModelFamily {
  /** Recognizes this family's IDs across every provider naming scheme. */
  match: RegExp;
  /** Model name used in the one-time deprecation warnings surfaced to users. */
  warningName?: string;
  /** Rejects `temperature`/`top_p`/`top_k` at the model level (the API returns 400). */
  samplingParamsDeprecated?: boolean;
  /** Thinking is always on; `thinking: { type: 'disabled' }` is rejected. */
  alwaysOnAdaptiveThinking?: boolean;
  /** 10% premium on Bedrock regional / Vertex regional+multi-region endpoints vs global. */
  regionalPremium?: boolean;
}

/**
 * Single source of truth for Claude model capabilities. Adding a model is a new row here
 * (plus, if a provider branches on it by name, a thin `isClaude<Model>Model` accessor)
 * instead of editing several parallel OR-chains. Regional-premium coverage follows
 * Anthropic's "Claude 4.5 models and beyond" pricing (Sonnet 4.5, Haiku 4.5, Opus 4.5, and
 * every later model); Opus 4.1 and earlier retain base pricing on all endpoints.
 */
const CLAUDE_MODEL_FAMILIES: readonly ClaudeModelFamily[] = [
  {
    match: CLAUDE_FABLE_MYTHOS_5_PATTERN,
    warningName: 'Claude Fable 5 and Claude Mythos 5',
    samplingParamsDeprecated: true,
    alwaysOnAdaptiveThinking: true,
    regionalPremium: true,
  },
  {
    match: CLAUDE_SONNET_5_PATTERN,
    warningName: 'Claude Sonnet 5',
    samplingParamsDeprecated: true,
    regionalPremium: true,
  },
  // Opus 4.7 and 4.8 share behavior and warning wording.
  {
    match: CLAUDE_OPUS_48_PATTERN,
    warningName: 'Claude Opus 4.7 and 4.8',
    samplingParamsDeprecated: true,
    regionalPremium: true,
  },
  {
    match: CLAUDE_OPUS_47_PATTERN,
    warningName: 'Claude Opus 4.7 and 4.8',
    samplingParamsDeprecated: true,
    regionalPremium: true,
  },
  { match: CLAUDE_4_5_AND_4_6_TIER_PATTERN, regionalPremium: true },
];

function hasClaudeCapability(
  modelId: string,
  capability: 'samplingParamsDeprecated' | 'alwaysOnAdaptiveThinking' | 'regionalPremium',
): boolean {
  return CLAUDE_MODEL_FAMILIES.some((family) => family[capability] && family.match.test(modelId));
}

/** Matches Claude Opus 4.7 model IDs (see the pattern constants above for boundary rules). */
export function isClaudeOpus47Model(modelId: string): boolean {
  return CLAUDE_OPUS_47_PATTERN.test(modelId);
}

/** Matches Claude Opus 4.8 model IDs. */
export function isClaudeOpus48Model(modelId: string): boolean {
  return CLAUDE_OPUS_48_PATTERN.test(modelId);
}

/** Matches the Claude 5 Fable and Mythos model IDs. */
export function isClaudeFableOrMythos5Model(modelId: string): boolean {
  return CLAUDE_FABLE_MYTHOS_5_PATTERN.test(modelId);
}

/** Matches Claude Sonnet 5 model IDs (not `claude-sonnet-4-5`, not `claude-sonnet-50`). */
export function isClaudeSonnet5Model(modelId: string): boolean {
  return CLAUDE_SONNET_5_PATTERN.test(modelId);
}

/**
 * Name for a model in user-facing deprecation warnings, or `undefined` when it is not a
 * recognized family (callers fall back to a generic phrase).
 */
export function getClaudeModelWarningName(modelId: string): string | undefined {
  return CLAUDE_MODEL_FAMILIES.find((family) => family.warningName && family.match.test(modelId))
    ?.warningName;
}

/**
 * Claude models that carry a 10% premium on Bedrock regional and Vertex regional/multi-region
 * endpoints (vs the global endpoint), per Anthropic's "Claude 4.5 models and beyond" pricing.
 */
export function isClaudeRegionalPremiumModel(modelId: string): boolean {
  return hasClaudeCapability(modelId, 'regionalPremium');
}

export function isAlwaysOnAdaptiveThinkingClaudeModel(modelId: string): boolean {
  return hasClaudeCapability(modelId, 'alwaysOnAdaptiveThinking');
}

export function normalizeAnthropicModelName(modelName: string): string {
  return modelName.replace(/^(?:(?:global|us|eu|jp|au)\.)?anthropic\./, '');
}

/**
 * Claude Opus 4.7+, Claude Sonnet 5, and Claude 5 Fable/Mythos deprecate manual sampling
 * controls at the model level — `temperature`, `top_p`, and `top_k` return 400
 * `invalid_request_error` (including promptfoo's built-in `temperature` default of 0). Shared
 * by the Anthropic, Bedrock, Vertex, and Azure providers; support for a new model lands as a
 * row in CLAUDE_MODEL_FAMILIES above.
 */
export function isSamplingParamsDeprecatedClaudeModel(modelId: string): boolean {
  return hasClaudeCapability(modelId, 'samplingParamsDeprecated');
}

/**
 * Normalize a Claude thinking config for models that deprecate manual
 * budget-based thinking: an `enabled` budget converts to adaptive thinking
 * (preserving `display`), and `disabled` is omitted on always-on adaptive
 * thinking models (Fable 5 / Mythos 5), which reject it. The Anthropic,
 * Bedrock InvokeModel/Converse, and Vertex paths all share this transform;
 * user-facing warnings stay at the call sites that surface them.
 */
export function normalizeClaudeThinkingConfig<
  T extends { type: string; display?: 'summarized' | 'omitted' | null },
>(
  modelId: string,
  thinking: T | undefined,
): T | { type: 'adaptive'; display?: 'summarized' | 'omitted' } | undefined {
  if (thinking?.type === 'enabled' && isSamplingParamsDeprecatedClaudeModel(modelId)) {
    return { type: 'adaptive', ...(thinking.display ? { display: thinking.display } : {}) };
  }
  if (thinking?.type === 'disabled' && isAlwaysOnAdaptiveThinkingClaudeModel(modelId)) {
    return undefined;
  }
  return thinking;
}

// Bedrock and Vertex bill Claude 4.5+ regional/geo endpoints at this premium over
// the global endpoint (see isClaudeRegionalPremiumModel).
export const CLAUDE_REGIONAL_ENDPOINT_PREMIUM = 1.1;

/**
 * Mark a cost config for the Claude regional endpoint premium (see isClaudeRegionalPremiumModel),
 * unless the user supplied an explicit `cost`/`inputCost`/`outputCost` override. The premium is a
 * flat multiplier that calculateAnthropicCost applies to the *final* computed cost, so it composes
 * with cache pricing rather than overriding it. Callers decide whether the request is regional.
 */
export function applyClaudeRegionalPremium(modelName: string, config: any): any {
  if (
    !isClaudeRegionalPremiumModel(modelName) ||
    config.cost != null ||
    config.inputCost != null ||
    config.outputCost != null
  ) {
    return config;
  }
  return { ...config, regionalPremiumMultiplier: CLAUDE_REGIONAL_ENDPOINT_PREMIUM };
}

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
        } else if (block.type === 'thinking' && showThinking && block.thinking.trim() !== '') {
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
export function calculateCacheInputCost(
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
  const pricingModelName = normalizeAnthropicModelName(modelName);
  const modelInfo = ANTHROPIC_MODELS.find((model) => model.id === pricingModelName);
  // A model name that normalizeAnthropicModelName rewrote carries a Bedrock
  // prefix. Bare and geo-prefixed Bedrock IDs bill at the regional premium;
  // only the `global.` endpoint bills at base rate.
  const usesRegionalBedrockPricing =
    pricingModelName !== modelName && !modelName.startsWith('global.');
  const effectiveConfig = usesRegionalBedrockPricing
    ? applyClaudeRegionalPremium(modelName, config)
    : config;
  // Apply the regional endpoint premium (if any) as a flat multiplier on the final cost, so it
  // composes with cache pricing rather than overriding it.
  const regionalPremiumMultiplier: number = effectiveConfig.regionalPremiumMultiplier ?? 1;
  const withRegionalPremium = (cost: number | undefined): number | undefined =>
    cost == null ? cost : cost * regionalPremiumMultiplier;

  if (
    effectiveConfig.cost != null &&
    effectiveConfig.inputCost == null &&
    effectiveConfig.outputCost == null
  ) {
    return withRegionalPremium(
      calculateCostBase(
        pricingModelName,
        effectiveConfig,
        promptTokens,
        completionTokens,
        ANTHROPIC_MODELS,
      ),
    );
  }

  if (
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens) ||
    typeof promptTokens === 'undefined' ||
    typeof completionTokens === 'undefined'
  ) {
    return withRegionalPremium(
      calculateCostBase(
        pricingModelName,
        effectiveConfig,
        promptTokens,
        completionTokens,
        ANTHROPIC_MODELS,
      ),
    );
  }

  const cacheRead = cacheReadTokens ?? 0;
  const cacheCreation = cacheCreationTokens ?? 0;

  // Per-token rates are flat regardless of prompt size — every model bills its full
  // context window at the standard rate. Apply cache pricing only when cache tokens
  // are present.
  if (cacheRead || cacheCreation) {
    if (modelInfo) {
      const inputCost = effectiveConfig.inputCost ?? effectiveConfig.cost ?? modelInfo.cost.input;
      const outputCost =
        effectiveConfig.outputCost ?? effectiveConfig.cost ?? modelInfo.cost.output;
      return withRegionalPremium(
        calculateCacheInputCost(inputCost, promptTokens, cacheRead, cacheCreation) +
          completionTokens * outputCost,
      );
    }
  }

  return withRegionalPremium(
    calculateCostBase(
      pricingModelName,
      effectiveConfig,
      promptTokens,
      completionTokens,
      ANTHROPIC_MODELS,
    ),
  );
}

/**
 * Extract refusal details from the Anthropic stop_details field.
 * Returns a human-readable string if the response was refused, or undefined otherwise.
 */
export function getRefusalDetails(data: Anthropic.Messages.Message): string | undefined {
  if (data.stop_reason !== 'refusal' || !data.stop_details) {
    return undefined;
  }
  const details = data.stop_details;
  const parts: string[] = ['Content refused by Anthropic safety filters'];
  if (details.category) {
    parts.push(`category: ${details.category}`);
  }
  if (details.explanation) {
    parts.push(`explanation: ${details.explanation}`);
  }
  return parts.join(' — ');
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

      const thinkingTokens = data.usage.output_tokens_details?.thinking_tokens;
      const hasCacheDetails =
        data.usage.cache_read_input_tokens != null ||
        data.usage.cache_creation_input_tokens != null;

      if (thinkingTokens != null || hasCacheDetails) {
        usage.completionDetails = {
          ...(thinkingTokens != null && { reasoning: thinkingTokens }),
          // Cache *input* token counts go under completionDetails because Promptfoo's
          // TokenUsage contract has no input-details field.
          ...(hasCacheDetails && {
            cacheReadInputTokens: cacheRead,
            cacheCreationInputTokens: cacheCreation,
          }),
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
    | Anthropic.Messages.WebFetchTool20250910
    | Anthropic.Messages.WebFetchTool20260209
    | Anthropic.Messages.WebFetchTool20260309
    | Anthropic.Messages.MemoryTool20250818
    | Anthropic.Messages.WebSearchTool20250305
    | Anthropic.Messages.WebSearchTool20260209
  )[];
  requiredBetaFeatures: string[];
} {
  const processedTools: (
    | Anthropic.Tool
    | Anthropic.Messages.WebFetchTool20250910
    | Anthropic.Messages.WebFetchTool20260209
    | Anthropic.Messages.WebFetchTool20260309
    | Anthropic.Messages.MemoryTool20250818
    | Anthropic.Messages.WebSearchTool20250305
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
      } else if (tool.type === 'memory_20250818') {
        processedTools.push(tool as Anthropic.Messages.MemoryTool20250818);
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
    | Anthropic.Messages.WebFetchTool20250910
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
): Anthropic.Messages.WebFetchTool20250910 {
  const tool: Anthropic.Messages.WebFetchTool20250910 = {
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
  tool: Anthropic.Messages.WebSearchTool20250305 | Anthropic.Messages.WebSearchTool20260209,
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
): Anthropic.Messages.WebSearchTool20250305 {
  const tool: Anthropic.Messages.WebSearchTool20250305 = {
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
