import { parseDataUrl } from '../../util/dataUrl';
import { calculateCost as calculateCostBase } from '../shared';
import type Anthropic from '@anthropic-ai/sdk';

import type { TokenUsage } from '../../types/index';
import type {
  AnthropicToolConfig,
  ClaudeEffort,
  WebFetchToolConfig,
  WebFetchToolConfigV2,
  WebSearchToolConfig,
} from './types';

export const CLAUDE_SONNET_5_STANDARD_PRICING_START_MS = Date.UTC(2026, 8, 1);

/**
 * Return Claude Sonnet 5's active base rates in dollars per million tokens.
 *
 * Anthropic's introductory $2/$10 pricing runs through August 31, 2026; standard
 * $3/$15 pricing starts at 00:00 UTC on September 1. Read the clock on every cost
 * calculation so a long-running promptfoo process crosses the boundary correctly.
 */
export function getClaudeSonnet5PricingPerMillion(now = Date.now()): {
  input: number;
  output: number;
} {
  return now < CLAUDE_SONNET_5_STANDARD_PRICING_START_MS
    ? { input: 2, output: 10 }
    : { input: 3, output: 15 };
}

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
  // Claude Opus 5 — the Opus-tier Claude 5 model. 1M context window (both the default
  // and the maximum) with the full low→max effort ladder, at the same list pricing as
  // Opus 4.8 ($5/$25), so it is a drop-in cost swap. The full 1M context bills at this
  // flat rate. Fast mode ($10/$50, Claude API only) is a separate research-preview rate
  // that is intentionally not encoded here; set an explicit `cost` to track it.
  ...['claude-opus-5'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1e6, // $5 / MTok
      output: 25 / 1e6, // $25 / MTok
    },
  })),
  // Claude Sonnet 5 — the calculator replaces these introductory rates at runtime
  // when standard $3/$15 pricing takes effect on Sep 1, 2026.
  ...['claude-sonnet-5'].map((model) => ({
    id: model,
    cost: {
      input: 2 / 1e6, // $2 / MTok
      output: 10 / 1e6, // $10 / MTok
    },
  })),
  // Claude Mythos Preview (deprecated; retained for historical cost scoring)
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
  // NOTE: Anthropic publishes a single dateless ID for Opus 4.7 — the Models API
  // returns 404 for `claude-opus-4-7-latest` and for dated snapshots such as
  // `claude-opus-4-7-20260416` (verified live 2026-07-17), so we intentionally only
  // register the canonical ID here. (Azure AI Foundry's dated Claude deployment
  // names are a separate namespace, priced in azure/defaults.ts.)
  ...['claude-opus-4-7'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1e6, // $5 / MTok
      output: 25 / 1e6, // $25 / MTok
    },
  })),
  // Claude 4.6 IDs are dateless pinned snapshots. Anthropic does not publish separate
  // `-latest` pointers for them.
  ...['claude-sonnet-4-6'].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6, // $3 / MTok
      output: 15 / 1e6, // $15 / MTok
    },
  })),
  ...['claude-opus-4-6'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1e6, // $5 / MTok
      output: 25 / 1e6, // $25 / MTok
    },
  })),
  ...['claude-opus-4-5', 'claude-opus-4-5-20251101'].map((model) => ({
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
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-0',
  ].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6, // $3 / MTok
      output: 15 / 1e6, // $15 / MTok
    },
  })),
  ...['claude-haiku-4-5', 'claude-haiku-4-5-20251001'].map((model) => ({
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

// These aliases were previously accepted by promptfoo, but Anthropic does not publish them as
// first-party model IDs. Keep them out of ANTHROPIC_MODELS so they are not presented as current
// catalog entries or priced by default. They remain available for shorthand routing through
// compatible gateways, and their former rates provide the missing half of a partial explicit
// pricing override.
const ANTHROPIC_COMPATIBILITY_ALIAS_MODELS = [
  ...['claude-opus-4-6-latest', 'claude-opus-4-5-latest'].map((id) => ({
    id,
    cost: { input: 5 / 1e6, output: 25 / 1e6 },
  })),
  ...['claude-sonnet-4-6-latest', 'claude-sonnet-4-5-latest'].map((id) => ({
    id,
    cost: { input: 3 / 1e6, output: 15 / 1e6 },
  })),
  {
    id: 'claude-haiku-4-5-latest',
    cost: { input: 1 / 1e6, output: 5 / 1e6 },
  },
  {
    id: 'claude-opus-4-latest',
    cost: { input: 15 / 1e6, output: 75 / 1e6 },
  },
  {
    id: 'claude-sonnet-4-latest',
    cost: { input: 3 / 1e6, output: 15 / 1e6 },
  },
];

export const ANTHROPIC_SHORTHAND_MODEL_IDS = new Set([
  ...ANTHROPIC_MODELS.map((model) => model.id),
  ...ANTHROPIC_COMPATIBILITY_ALIAS_MODELS.map((model) => model.id),
]);

// Model-ID matchers for each Claude family, across Anthropic, Bedrock (incl. the
// `us.`/`eu.`/`jp.`/`global.` inference-profile prefixes), Vertex, and Azure deployment
// names. The leading `(^|[^a-z0-9])` boundary and a trailing lookahead guard (`(?![0-9])`,
// or `(?![a-z0-9])` for the dateless Fable/Mythos IDs) keep a family from matching a longer
// neighbor (e.g. `claude-opus-4-80` is not Opus 4.8, and `claude-sonnet-4-5` is not Sonnet 5)
// while still matching dated snapshots like `claude-opus-4-8-20260528`.
const CLAUDE_FABLE_MYTHOS_5_PATTERN = /(^|[^a-z0-9])claude-(?:fable|mythos)-5(?![a-z0-9])/i;
const CLAUDE_MYTHOS_PREVIEW_RE = /(^|[^a-z0-9])claude-mythos-preview(?![a-z0-9])/i;
const CLAUDE_OPUS_5_PATTERN = /(^|[^a-z0-9])claude-opus-5(?![0-9])/i;
const CLAUDE_SONNET_5_PATTERN = /(^|[^a-z0-9])claude-sonnet-5(?![0-9])/i;
const CLAUDE_OPUS_48_PATTERN = /(^|[^a-z0-9])claude-opus-4-8(?![0-9])/i;
const CLAUDE_OPUS_47_PATTERN = /(^|[^a-z0-9])claude-opus-4-7(?![0-9])/i;
// Opus/Sonnet 4.5 and 4.6, and Haiku 4.5 — regional premium only (no other deprecations).
const CLAUDE_4_5_AND_4_6_REGIONAL_PREMIUM_PATTERN =
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
  /**
   * Omitting `thinking` runs adaptive thinking rather than no thinking, so requests that never
   * set `thinking` still spend thinking tokens against `max_tokens`.
   */
  thinkingOnByDefault?: boolean;
  /**
   * `thinking: { type: 'disabled' }` is only accepted at effort `high` or below — pairing it
   * with `xhigh`/`max` returns 400. Unlike `alwaysOnAdaptiveThinking`, disabling thinking is
   * still possible, just effort-gated.
   */
  disabledThinkingEffortCapped?: boolean;
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
    match: CLAUDE_MYTHOS_PREVIEW_RE,
    warningName: 'Claude Mythos Preview',
    alwaysOnAdaptiveThinking: true,
  },
  {
    match: CLAUDE_FABLE_MYTHOS_5_PATTERN,
    warningName: 'Claude Fable 5 and Claude Mythos 5',
    samplingParamsDeprecated: true,
    alwaysOnAdaptiveThinking: true,
    regionalPremium: true,
  },
  // Opus 5 thinks by default (omitting `thinking` runs adaptive, unlike Opus 4.7/4.8) and
  // still accepts `disabled`, but only at effort `high` or below.
  {
    match: CLAUDE_OPUS_5_PATTERN,
    warningName: 'Claude Opus 5',
    samplingParamsDeprecated: true,
    thinkingOnByDefault: true,
    disabledThinkingEffortCapped: true,
    regionalPremium: true,
  },
  {
    match: CLAUDE_SONNET_5_PATTERN,
    warningName: 'Claude Sonnet 5',
    samplingParamsDeprecated: true,
    thinkingOnByDefault: true,
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
  { match: CLAUDE_4_5_AND_4_6_REGIONAL_PREMIUM_PATTERN, regionalPremium: true },
];

/**
 * The boolean capability flags on ClaudeModelFamily, derived from the interface so that adding
 * a capability is a single edit there rather than a matching edit here.
 */
type ClaudeCapability = {
  [K in keyof ClaudeModelFamily]-?: NonNullable<ClaudeModelFamily[K]> extends boolean ? K : never;
}[keyof ClaudeModelFamily];

function hasClaudeCapability(modelId: string, capability: ClaudeCapability): boolean {
  return CLAUDE_MODEL_FAMILIES.some((family) => family[capability] && family.match.test(modelId));
}

/** Matches Claude Opus 5 model IDs (not `claude-opus-4-5`, not `claude-opus-50`). */
export function isClaudeOpus5Model(modelId: string): boolean {
  return CLAUDE_OPUS_5_PATTERN.test(modelId);
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

/**
 * True when omitting `thinking` still runs adaptive thinking (Claude Opus 5 / Sonnet 5). Callers use this
 * so that thinking-token headroom (e.g. the default `max_tokens`) reflects what the API will
 * actually do rather than assuming an absent `thinking` field means thinking is off.
 */
export function isThinkingOnByDefaultClaudeModel(modelId: string): boolean {
  return hasClaudeCapability(modelId, 'thinkingOnByDefault');
}

/**
 * Whether a request will spend output tokens on thinking, given the thinking config as
 * normalized by {@link normalizeClaudeThinkingConfig}. Thinking shares the `max_tokens`
 * budget with the answer, so providers size their default `max_tokens` off this — get it
 * wrong and responses truncate mid-answer.
 *
 * Note this is deliberately NOT the same question as "is thinking enabled". A model that
 * thinks by default consumes tokens without the request ever saying so, but must not be
 * treated as explicitly-enabled thinking: that would trigger the legacy extended-thinking
 * incompatibilities (forced `tool_choice` suppression, `top_p` clamping) which do not apply
 * to adaptive thinking. Callers that need that second question keep their own predicate.
 */
export function claudeThinkingConsumesTokens(
  modelId: string,
  resolvedThinking: { type?: string } | undefined | null,
): boolean {
  return (
    isAlwaysOnAdaptiveThinkingClaudeModel(modelId) ||
    resolvedThinking?.type === 'enabled' ||
    resolvedThinking?.type === 'adaptive' ||
    (resolvedThinking == null && isThinkingOnByDefaultClaudeModel(modelId))
  );
}

/**
 * True when `thinking: { type: 'disabled' }` would be rejected for this model at this effort
 * level. Claude Opus 5 thinks by default and only accepts `disabled` at effort `high` or below,
 * so `disabled` + `xhigh`/`max` is a 400. An unset effort uses the API default (`high`), which
 * is within the cap.
 */
export function isDisabledThinkingRejectedAtEffort(
  modelId: string,
  effort: ClaudeEffort | undefined | null,
): boolean {
  return (
    hasClaudeCapability(modelId, 'disabledThinkingEffortCapped') &&
    (effort === 'xhigh' || effort === 'max')
  );
}

export function normalizeAnthropicModelName(modelName: string): string {
  return modelName.replace(/^(?:(?:global|us|eu|jp|au)\.)?anthropic\./, '');
}

/**
 * Claude Opus 4.7/4.8, Claude Opus 5, Claude Sonnet 5, and Claude 5 Fable/Mythos deprecate manual sampling
 * controls at the model level — `temperature`, `top_p`, and `top_k` return 400
 * `invalid_request_error` (including promptfoo's built-in `temperature` default of 0). Shared
 * by the Anthropic, Bedrock, Vertex, and Azure providers; support for a new model lands as a
 * row in CLAUDE_MODEL_FAMILIES above.
 */
export function isSamplingParamsDeprecatedClaudeModel(modelId: string): boolean {
  return hasClaudeCapability(modelId, 'samplingParamsDeprecated');
}

/**
 * Normalize a Claude thinking config for models that require adaptive thinking:
 * an `enabled` budget converts to adaptive thinking (preserving `display`), and
 * `disabled` is omitted on always-on adaptive thinking models, which reject it.
 * `disabled` is also
 * omitted on effort-capped models (Opus 5) when `effort` is high enough that
 * the combination would 400. The Anthropic, Bedrock InvokeModel/Converse, and
 * Vertex paths all share this transform; user-facing warnings stay at the call
 * sites that surface them.
 */
export function normalizeClaudeThinkingConfig<
  T extends { type: string; display?: 'summarized' | 'omitted' | null },
>(
  modelId: string,
  thinking: T | undefined,
  effort: ClaudeEffort | null | undefined,
): T | { type: 'adaptive'; display?: 'summarized' | 'omitted' } | undefined {
  if (
    thinking?.type === 'enabled' &&
    (isSamplingParamsDeprecatedClaudeModel(modelId) ||
      isAlwaysOnAdaptiveThinkingClaudeModel(modelId))
  ) {
    return { type: 'adaptive', ...(thinking.display ? { display: thinking.display } : {}) };
  }
  if (
    thinking?.type === 'disabled' &&
    (isAlwaysOnAdaptiveThinkingClaudeModel(modelId) ||
      isDisabledThinkingRejectedAtEffort(modelId, effort))
  ) {
    return undefined;
  }
  return thinking;
}

// Bedrock and Vertex bill Claude 4.5+ regional/geo endpoints at this premium over
// the global endpoint (see isClaudeRegionalPremiumModel).
export const CLAUDE_REGIONAL_ENDPOINT_PREMIUM = 1.1;
const CLAUDE_US_INFERENCE_GEO_MULTIPLIER = 1.1;
const CLAUDE_46_OR_LATER_MODEL_PATTERN =
  /^claude-(?:(?:opus|sonnet)-4-(?:6|7|8)(?:-|$)|(?:fable|mythos|opus|sonnet)-5(?:-|$))/;

/**
 * Mark a cost config for the Claude regional endpoint premium (see isClaudeRegionalPremiumModel),
 * unless the user supplied an explicit `cost`/`inputCost`/`outputCost` override. The premium is a
 * flat multiplier that calculateAnthropicCost applies to the *final* computed cost, so it composes
 * with provider-selected long-context and cache pricing rather than overriding either. Callers
 * decide whether the request is regional.
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
 * Cache reads cost 10% of base rate (90% discount). Five-minute cache writes cost 125% of
 * base rate and one-hour cache writes cost 200% of base rate.
 */
export function calculateCacheInputCost(
  baseInputRate: number,
  uncachedInputTokens: number,
  cacheRead: number,
  cacheCreation: number,
  cacheCreation1h = 0,
): number {
  const oneHourCacheCreation = Math.min(Math.max(cacheCreation1h, 0), cacheCreation);
  const fiveMinuteCacheCreation = Math.max(cacheCreation - oneHourCacheCreation, 0);
  return (
    uncachedInputTokens * baseInputRate +
    cacheRead * baseInputRate * 0.1 +
    fiveMinuteCacheCreation * baseInputRate * 1.25 +
    oneHourCacheCreation * baseInputRate * 2
  );
}

export function calculateAnthropicCost(
  modelName: string,
  config: any,
  promptTokens?: number,
  completionTokens?: number,
  cacheReadTokens?: number,
  cacheCreationTokens?: number,
  cacheCreation1hTokens?: number,
  reportedInferenceGeo?: string | null,
): number | undefined {
  const pricingModelName = normalizeAnthropicModelName(modelName);
  const hasExplicitPricing =
    config.cost != null || config.inputCost != null || config.outputCost != null;
  const registeredModel =
    ANTHROPIC_MODELS.find((model) => model.id === pricingModelName) ??
    (hasExplicitPricing
      ? ANTHROPIC_COMPATIBILITY_ALIAS_MODELS.find((model) => model.id === pricingModelName)
      : undefined);
  const sonnet5Pricing =
    pricingModelName === 'claude-sonnet-5' ? getClaudeSonnet5PricingPerMillion() : undefined;
  const modelInfo =
    registeredModel && sonnet5Pricing
      ? {
          ...registeredModel,
          cost: {
            input: sonnet5Pricing.input / 1e6,
            output: sonnet5Pricing.output / 1e6,
          },
        }
      : registeredModel;
  // A model name that normalizeAnthropicModelName rewrote carries a Bedrock
  // prefix. Bare and geo-prefixed Bedrock IDs bill at the regional premium;
  // only the `global.` endpoint bills at base rate.
  const usesRegionalBedrockPricing =
    pricingModelName !== modelName && !modelName.startsWith('global.');
  const effectiveConfig = usesRegionalBedrockPricing
    ? applyClaudeRegionalPremium(modelName, config)
    : config;
  // Apply the regional endpoint premium (if any) as a flat multiplier on the final cost, so it
  // composes with long-context and cache pricing rather than overriding either.
  const regionalPremiumMultiplier: number = effectiveConfig.regionalPremiumMultiplier ?? 1;
  const inferenceGeo = reportedInferenceGeo ?? effectiveConfig?.extra_body?.inference_geo;
  const usesUsInferenceGeo =
    pricingModelName === modelName &&
    inferenceGeo === 'us' &&
    CLAUDE_46_OR_LATER_MODEL_PATTERN.test(pricingModelName) &&
    effectiveConfig.cost == null &&
    effectiveConfig.inputCost == null &&
    effectiveConfig.outputCost == null;
  const inferenceGeoMultiplier = usesUsInferenceGeo ? CLAUDE_US_INFERENCE_GEO_MULTIPLIER : 1;
  const withPricingMultipliers = (cost: number | undefined): number | undefined =>
    cost == null ? cost : cost * regionalPremiumMultiplier * inferenceGeoMultiplier;

  // An explicit flat `cost` (with no separate input/output rates) intentionally overrides
  // tier-specific and cache pricing, so it short-circuits straight to the base calculation.
  const usesFlatCost =
    effectiveConfig.cost != null &&
    effectiveConfig.inputCost == null &&
    effectiveConfig.outputCost == null;
  const cacheRead = cacheReadTokens ?? 0;
  const cacheCreation = cacheCreationTokens ?? 0;
  const cacheCreation1h = cacheCreation1hTokens ?? 0;

  // This shared helper does not infer size-based tiers. Provider-specific callers can supply
  // explicit input/output rates, while cache pricing is applied whenever cache tokens are present.
  // The `typeof` guards narrow `number | undefined` to `number`; `Number.isFinite` alone already
  // rejects `undefined` at runtime but does not narrow the type.
  if (
    !usesFlatCost &&
    modelInfo &&
    (cacheRead || cacheCreation) &&
    typeof promptTokens !== 'undefined' &&
    typeof completionTokens !== 'undefined' &&
    Number.isFinite(promptTokens) &&
    Number.isFinite(completionTokens)
  ) {
    const inputCost = effectiveConfig.inputCost ?? effectiveConfig.cost ?? modelInfo.cost.input;
    const outputCost = effectiveConfig.outputCost ?? effectiveConfig.cost ?? modelInfo.cost.output;
    return withPricingMultipliers(
      calculateCacheInputCost(inputCost, promptTokens, cacheRead, cacheCreation, cacheCreation1h) +
        completionTokens * outputCost,
    );
  }

  return withPricingMultipliers(
    calculateCostBase(
      pricingModelName,
      effectiveConfig,
      promptTokens,
      completionTokens,
      modelInfo ? [modelInfo] : [],
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
 * Config fields copied onto the SDK tool object, in the order they are written. Order is
 * significant only in that it fixes the key order of the emitted object; the `satisfies`
 * clauses keep these lists honest against the config interfaces.
 */
const WEB_FETCH_FIELDS = [
  'allowed_callers',
  'max_uses',
  'allowed_domains',
  'blocked_domains',
  'citations',
  'max_content_tokens',
  'cache_control',
  'defer_loading',
  'strict',
] as const satisfies readonly (keyof WebFetchToolConfig)[];

const WEB_SEARCH_FIELDS = [
  'allowed_callers',
  'allowed_domains',
  'blocked_domains',
  'cache_control',
  'defer_loading',
  'max_uses',
  'strict',
  'user_location',
] as const satisfies readonly (keyof WebSearchToolConfig)[];

interface ServerToolSpec {
  /** Tool name the API expects; always overrides whatever `name` the user config carried. */
  name: 'web_fetch' | 'web_search';
  fields: readonly string[];
  /** Beta feature this tool version requires, if any. */
  betaFeature?: string;
}

/**
 * Anthropic server tools promptfoo rebuilds from config, keyed by tool `type`.
 *
 * A Map rather than an object literal so a config with a prototype-shaped `type`
 * (`constructor`, `toString`, `__proto__`, …) misses cleanly and falls through to
 * pass-through, instead of resolving to an Object.prototype member and throwing.
 */
const SERVER_TOOL_SPECS = new Map<string, ServerToolSpec>([
  [
    'web_fetch_20250910',
    { name: 'web_fetch', fields: WEB_FETCH_FIELDS, betaFeature: 'web-fetch-2025-09-10' },
  ],
  ['web_fetch_20260209', { name: 'web_fetch', fields: WEB_FETCH_FIELDS }],
  // The 20260309 version is the only one that supports use_cache.
  [
    'web_fetch_20260309',
    {
      name: 'web_fetch',
      fields: [...WEB_FETCH_FIELDS, 'use_cache' satisfies keyof WebFetchToolConfigV2],
    },
  ],
  // Web search needs no beta header in the current SDK.
  ['web_search_20250305', { name: 'web_search', fields: WEB_SEARCH_FIELDS }],
  ['web_search_20260209', { name: 'web_search', fields: WEB_SEARCH_FIELDS }],
]);

/**
 * Processes tools configuration to handle web fetch and web search tools
 */
export function processAnthropicTools(
  tools: (Anthropic.Messages.ToolUnion | AnthropicToolConfig)[] = [],
): {
  processedTools: Anthropic.Messages.ToolUnion[];
  requiredBetaFeatures: string[];
} {
  const processedTools: Anthropic.Messages.ToolUnion[] = [];
  const requiredBetaFeatures: string[] = [];

  const addRequiredBetaFeature = (feature: string) => {
    if (!requiredBetaFeatures.includes(feature)) {
      requiredBetaFeatures.push(feature);
    }
  };

  for (const tool of tools) {
    // Server tools are rebuilt from a spec so the SDK object carries only the fields we
    // support, in a stable order. Everything else (memory, standard Anthropic tools) is
    // passed through untouched.
    const toolType = 'type' in tool && typeof tool.type === 'string' ? tool.type : undefined;
    const spec = toolType === undefined ? undefined : SERVER_TOOL_SPECS.get(toolType);
    if (spec) {
      const source = tool as unknown as Record<string, unknown>;
      const built: Record<string, unknown> = { type: toolType, name: spec.name };
      for (const field of spec.fields) {
        const value = source[field];
        if (value !== undefined) {
          built[field] = value;
        }
      }
      processedTools.push(built as unknown as Anthropic.Messages.ToolUnion);
      if (spec.betaFeature) {
        addRequiredBetaFeature(spec.betaFeature);
      }
    } else {
      processedTools.push(tool as Anthropic.Messages.ToolUnion);
    }

    // Check if tool uses strict mode (structured outputs for tools)
    if ('strict' in tool && tool.strict === true) {
      addRequiredBetaFeature('structured-outputs-2025-11-13');
    }
  }

  return { processedTools, requiredBetaFeatures };
}
