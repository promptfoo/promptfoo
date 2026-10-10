import OpenAI from 'openai';
import logger from '../../logger';
import { maybeLoadFromExternalFileWithVars } from '../../util/index';
import { getAjv, safeJsonStringify } from '../../util/json';
import { isSafeCost, isSafeTokenCount } from '../../util/numeric';
import { isNonCredentialHeader, looksLikeSecret, sanitizeUrl } from '../../util/sanitizer';
import { calculateCost } from '../shared';

import type { TokenUsage, VarValue } from '../../types/index';
import type { ProviderConfig } from '../shared';

export const GPT_LONG_CONTEXT_THRESHOLD = 272_000;

// Billing relationships verified September 11, 2026. Keep the alias on the wire.
export const OPENAI_DAYBREAK_ALIASES = new Map([
  ['gpt-daybreak-blue-latest', 'gpt-5.6-sol'],
  ['gpt-daybreak-red-latest', 'gpt-5.6-cyber'],
]);

const AZURE_OPENAI_HOSTNAME = /(?:^|\.)(?:openai\.azure\.com|services\.ai\.azure\.com)$/;
const OPAQUE_CREDENTIAL_PATH_SEGMENT =
  /(?:^|\/)(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,}|(?:token|key|secret|credential|auth)[-_][a-z0-9._-]{8,})(?:\/|$)/i;

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getOpenAiEndpointHostname(value: string): string | undefined {
  try {
    const endpoint = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(endpoint).hostname;
  } catch {
    return undefined;
  }
}

export function isAzureOpenAiEndpoint(value: string | undefined): boolean {
  return value !== undefined && AZURE_OPENAI_HOSTNAME.test(getOpenAiEndpointHostname(value) ?? '');
}

export function isCustomOpenAiEndpoint(value: string): boolean {
  const hostname = getOpenAiEndpointHostname(value);
  return (
    hostname !== undefined &&
    !/^(?:[a-z0-9-]+\.)?api\.openai\.com$/.test(hostname) &&
    !AZURE_OPENAI_HOSTNAME.test(hostname)
  );
}

export function getOpenAiChatChoiceError(data: unknown):
  | {
      error: Record<string, unknown> & { message: string };
      partialOutput?: string | unknown[];
    }
  | undefined {
  const response = getRecord(data);
  const choice = Array.isArray(response?.choices) ? getRecord(response.choices[0]) : undefined;
  if (choice?.finish_reason !== 'error') {
    return undefined;
  }
  const error = getRecord(choice.error);
  if (!error) {
    return undefined;
  }
  const content = getRecord(choice.message)?.content;
  return {
    error: {
      ...error,
      message:
        typeof error.message === 'string'
          ? error.message
          : 'The provider failed during generation.',
    },
    ...((typeof content === 'string' || Array.isArray(content)) && content.length
      ? { partialOutput: content }
      : {}),
  };
}

function isOpenAiPolicyAccessRevoked(message: string): boolean {
  const entity = String.raw`(?:organization|account|api key|user|safety[- ]identifier)`;
  const access = String.raw`(?:access|permissions?)`;
  const providerTarget = String.raw`(?:(?:these|this|the|our|openai(?:['’]s)?)\s+)?(?:models?|api|service|platform|provider)`;
  const state = String.raw`(?:(?:has|have)\s+been|is|are|was|were)\s+(?:(?:temporarily|permanently)\s+)?(?:revoked|suspended|disabled|restricted)\b`;
  const patterns = [
    new RegExp(
      String.raw`^(?:your|this)\s+${entity}(?:['’]s)?\s+${access}(?:\s+to\s+${providerTarget})?\s+${state}`,
      'i',
    ),
    new RegExp(String.raw`^(?:your|this)\s+${access}\s+to\s+${providerTarget}\s+${state}`, 'i'),
    new RegExp(
      String.raw`^${access}\s+(?:for|of)\s+(?:(?:your|this|the)\s+)?${entity}(?:\s+["'][\w.-]+["'])?\s+${state}`,
      'i',
    ),
    new RegExp(String.raw`^(?:your|this|the)\s+${entity}\s+${state}`, 'i'),
    new RegExp(
      String.raw`^(?:we|openai|the provider)\s+(?:have|has)\s+(?:(?:temporarily|permanently)\s+)?(?:revoked|suspended|disabled|restricted)\s+(?:your|this)\s+(?:${entity}(?:['’]s)?\s+)?${access}(?:\s+to\s+${providerTarget})?(?:$|[!,;]|\s+(?:because|due)\b)`,
      'i',
    ),
  ];
  return message.split(/(?:[!?]|\.(?:\s|$)|\n)+/).some((part) => {
    const sentence = part.trim().replace(/^error:\s*/i, '');
    return patterns.some((pattern) => pattern.test(sentence));
  });
}

export function getOpenAiGatewayErrorType(data: unknown): string | undefined {
  const root = getRecord(data);
  const response = getRecord(root?.response) ?? root;
  const topLevelError = getRecord(response?.error);
  const choiceError = topLevelError ? undefined : getOpenAiChatChoiceError(response);
  const error = topLevelError ?? choiceError?.error;
  const metadata = getRecord(error?.metadata);
  return [
    metadata?.error_type,
    error?.error_type,
    choiceError ? undefined : response?.error_type,
  ].find((value): value is string => typeof value === 'string' && value.length > 0);
}

export function getOpenAiGatewayProviderCode(data: unknown): string | undefined {
  const root = getRecord(data);
  const response = getRecord(root?.response) ?? root;
  const error = getRecord(response?.error) ?? getOpenAiChatChoiceError(response)?.error;
  const metadata = getRecord(error?.metadata);
  const code = metadata?.provider_code ?? error?.code;
  return typeof code === 'string' ? code : undefined;
}

export function getOpenAiPartialOutput(output: unknown, jsonSchema: boolean): unknown {
  if (jsonSchema && typeof output === 'string') {
    try {
      return JSON.parse(output);
    } catch {
      // A refusal can interrupt a JSON response before it is complete.
    }
  }
  return output;
}

/** A gateway refusal marker distinguishes prompt blocks from native access-level policy errors. */
export function getOpenAiPolicyRefusal(
  data: unknown,
  allowGatewayMarker = false,
):
  | { message: string; code?: string; flaggedInput?: true; partialOutput?: string | unknown[] }
  | undefined {
  if (!allowGatewayMarker) {
    return undefined;
  }
  const root = getRecord(data);
  const response = getRecord(root?.response) ?? root;
  const topLevelError = getRecord(response?.error);
  const choiceError = topLevelError ? undefined : getOpenAiChatChoiceError(response);
  const error = topLevelError ?? choiceError?.error;
  if (!error) {
    return undefined;
  }
  const metadata = getRecord(error.metadata);
  const providerCode = metadata?.provider_code ?? error.code;
  const marker = getOpenAiGatewayErrorType(data);
  const message = typeof error.message === 'string' ? error.message : '';
  if (
    (marker !== 'refusal' && marker !== 'content_policy_violation') ||
    (marker === 'refusal' && isOpenAiPolicyAccessRevoked(message))
  ) {
    return undefined;
  }
  return {
    message: message.trim() ? message : 'The model provider declined this request.',
    ...(typeof providerCode === 'string' ? { code: providerCode } : {}),
    ...(!choiceError &&
    marker === 'refusal' &&
    (providerCode === 'bio_policy' || providerCode === 'cyber_policy')
      ? { flaggedInput: true as const }
      : {}),
    ...(choiceError?.partialOutput === undefined
      ? {}
      : { partialOutput: choiceError.partialOutput }),
  };
}

export function classifyOpenAiGatewayStreamError(
  data: unknown,
): 'refusal' | 'content_policy_violation' | 'potential' | 'technical' | undefined {
  const marker = getOpenAiGatewayErrorType(data);
  if (getOpenAiPolicyRefusal(data, true)) {
    return marker as 'refusal' | 'content_policy_violation';
  }
  if (marker) {
    return 'technical';
  }
  const root = getRecord(data);
  const response = getRecord(root?.response) ?? root;
  const error = getRecord(response?.error);
  switch (error?.code) {
    case 'image_content_policy_violation':
    case 'content_policy_violation':
    case 'content_filter':
      return 'content_policy_violation';
    case 'refusal':
      return 'refusal';
    case 'bio_policy':
    case 'cyber_policy':
      return 'potential';
    default:
      return undefined;
  }
}

function hasInlineSecret(value: string): boolean {
  return (
    looksLikeSecret(value) ||
    /(?:^|\s)(?:Bearer|Basic)\s+\S+/i.test(value) ||
    /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/.test(value) ||
    /(?:sk-(?:proj-|ant-)?[a-zA-Z0-9-_]{20,}|key-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|AIza[a-zA-Z0-9_-]{35})/.test(
      value,
    )
  );
}

export function hasSensitiveOpenAiCacheString(value: string): boolean {
  const urls = value.match(/\b(?:https?|s3|gs|az):\/\/[^\s<>"']+/gi) ?? [];
  return (
    urls.some((url) => {
      if (sanitizeUrl(url) !== url) {
        return true;
      }
      try {
        return hasSensitiveOpenAiCachePath(decodeURIComponent(new URL(url).pathname));
      } catch {
        return true;
      }
    }) || hasInlineSecret(value)
  );
}

export function hasSensitiveOpenAiCachePath(value: string): boolean {
  return hasInlineSecret(value) || OPAQUE_CREDENTIAL_PATH_SEGMENT.test(value);
}

export function hasOpenAiGatewayCredentials(
  headers: Record<string, string> | undefined,
  apiUrl: string,
): boolean {
  const hasCredentialHeader = Object.entries(headers ?? {}).some(
    ([name, value]) =>
      Boolean(value?.trim()) &&
      !isNonCredentialHeader(name) &&
      !/^(?:x-(?:request|correlation)-id|traceparent|tracestate|baggage)$/i.test(name),
  );
  return hasCredentialHeader || hasSensitiveOpenAiCacheString(apiUrl);
}

const DEFAULT_MAX_TOOL_ITERATIONS = 8;

/** Resolve a tool-call cap from 1 to 64, falling back to 8 for missing or out-of-range values. */
export function resolveMaxToolIterations(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 64
    ? Math.floor(value)
    : DEFAULT_MAX_TOOL_ITERATIONS;
}

export function appendOpenAiApiPath(apiUrl: string, endpoint: string, query?: string): string {
  const fragmentIndex = apiUrl.indexOf('#');
  const fragment = fragmentIndex === -1 ? '' : apiUrl.slice(fragmentIndex);
  const urlWithoutFragment = fragmentIndex === -1 ? apiUrl : apiUrl.slice(0, fragmentIndex);
  const queryIndex = urlWithoutFragment.indexOf('?');
  const base = queryIndex === -1 ? urlWithoutFragment : urlWithoutFragment.slice(0, queryIndex);
  const existingQuery = queryIndex === -1 ? '' : urlWithoutFragment.slice(queryIndex);
  const appendedQuery = query ? `${existingQuery ? '&' : '?'}${query}` : '';

  return `${base.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}${existingQuery}${appendedQuery}${fragment}`;
}
type OpenAIModelCost = {
  input: number;
  output: number;
  audioInput?: number;
  audioOutput?: number;
  longContext?: {
    threshold: number;
    input: number;
    output: number;
  };
};

type OpenAIModelInfo = {
  id: string;
  type?: string;
  cost?: OpenAIModelCost;
};

/**
 * Model IDs whose published OpenAI shutdown dates have passed.
 *
 * Keep these IDs in the billing tables for historical eval results, but exclude them from
 * current first-party routing registries. Do not add models before their shutdown date.
 */
export const RETIRED_OPENAI_MODEL_IDS: ReadonlySet<string> = new Set([
  // Additional current-main shutdowns, reconciled with the published lifecycle catalog.
  'gpt-5.2-chat-latest',
  'gpt-5.3-chat-latest',
  // Retired before 2026.
  'gpt-3.5-turbo-0301',
  'gpt-3.5-turbo-0613',
  'gpt-3.5-turbo-16k',
  'gpt-3.5-turbo-16k-0613',
  'gpt-4-32k',
  'gpt-4-32k-0314',
  'gpt-4-32k-0613',
  'gpt-4-1106-vision-preview',
  'gpt-4-vision-preview',
  'o1-preview',
  'o1-preview-2024-09-12',
  'o1-mini',
  'o1-mini-2024-09-12',
  'text-moderation-007',
  'text-moderation-latest',
  'text-moderation-stable',
  // Retired in 2026 before the July 23 shutdown.
  'chatgpt-4o-latest',
  'codex-mini-latest',
  'gpt-4-0314',
  'gpt-4-0125-preview',
  'gpt-4-turbo-preview',
  'gpt-4o-audio-preview',
  'gpt-4o-audio-preview-2024-10-01',
  'gpt-4o-audio-preview-2024-12-17',
  'gpt-4o-audio-preview-2025-06-03',
  'gpt-4o-mini-audio-preview',
  'gpt-4o-realtime-preview',
  'gpt-4o-realtime-preview-2024-10-01',
  'gpt-4o-realtime-preview-2024-12-17',
  'gpt-4o-realtime-preview-2025-06-03',
  'gpt-4o-mini-realtime-preview',
  // July 23, 2026 shutdowns.
  'computer-use-preview',
  'computer-use-preview-2025-03-11',
  'gpt-4o-search-preview-2025-03-11',
  'gpt-4o-mini-search-preview-2025-03-11',
  'gpt-5-chat-latest',
  'gpt-5-codex',
  'gpt-5.1-chat-latest',
  'gpt-5.1-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
  'gpt-5.2-codex',
  'gpt-audio-mini-2025-10-06',
  'gpt-realtime-mini-2025-10-06',
  'o3-deep-research',
  'o3-deep-research-2025-06-26',
  'o4-mini-deep-research',
  'o4-mini-deep-research-2025-06-26',
]);

// Preserve current-main discovery exclusions without inferring an exact shutdown from a
// missing catalog entry. These IDs may still be used with explicitly configured endpoints.
const LEGACY_OPENAI_DISCOVERY_EXCLUSIONS = new Set([
  'gpt-4o-mini-audio-preview-2024-12-17',
  'gpt-4o-mini-search-preview',
  'gpt-4o-search-preview',
  'gpt-5-chat',
]);

function excludeRetiredModels(models: OpenAIModelInfo[]): OpenAIModelInfo[] {
  return models.filter(
    ({ id }) => !RETIRED_OPENAI_MODEL_IDS.has(id) && !LEGACY_OPENAI_DISCOVERY_EXCLUSIONS.has(id),
  );
}

// Models served by /v1/audio/speech, not Chat Completions.
const OPENAI_TTS_AND_RETIRED_MODELS: OpenAIModelInfo[] = [
  ...modelsWithCost(
    ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15', 'gpt-4o-mini-tts-2025-03-20'],
    {
      input: 0.6 / 1e6,
      output: 0,
      audioOutput: 12 / 1e6,
    },
  ),
  ...['tts-1', 'tts-1-1106', 'tts-1-hd', 'tts-1-hd-1106'].map((model) => ({
    id: model,
  })),
];
export const OPENAI_TTS_MODELS = excludeRetiredModels(OPENAI_TTS_AND_RETIRED_MODELS);

// see https://platform.openai.com/docs/models
const OPENAI_CHAT_AND_RETIRED_MODELS: OpenAIModelInfo[] = [
  // Search preview models
  ...modelsWithCost(['gpt-4o-search-preview', 'gpt-4o-search-preview-2025-03-11'], {
    input: 2.5 / 1e6,
    output: 10 / 1e6,
  }),
  ...modelsWithCost(['gpt-4o-mini-search-preview', 'gpt-4o-mini-search-preview-2025-03-11'], {
    input: 0.15 / 1e6,
    output: 0.6 / 1e6,
  }),
  ...modelsWithCost(['gpt-5-search-api', 'gpt-5-search-api-2025-10-14'], {
    input: 1.25 / 1e6,
    output: 10 / 1e6,
  }),
  ...modelsWithCost(['chatgpt-4o-latest'], {
    input: 5 / 1e6,
    output: 15 / 1e6,
  }),
  // `chat-latest` is the bare alias for the latest Instant model used in ChatGPT
  // (the pricing page's "Specialized models › ChatGPT" row).
  ...modelsWithCost(['chat-latest'], {
    input: 5 / 1e6,
    output: 30 / 1e6,
  }),
  ...modelsWithCost(['gpt-4.1', 'gpt-4.1-2025-04-14'], {
    input: 2 / 1e6,
    output: 8 / 1e6,
  }),
  ...modelsWithCost(['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14'], {
    input: 0.4 / 1e6,
    output: 1.6 / 1e6,
  }),
  ...modelsWithCost(['gpt-4.1-nano', 'gpt-4.1-nano-2025-04-14'], {
    input: 0.1 / 1e6,
    output: 0.4 / 1e6,
  }),
  ...modelsWithCost(['o1', 'o1-2024-12-17', 'o1-preview', 'o1-preview-2024-09-12'], {
    input: 15 / 1e6,
    output: 60 / 1e6,
  }),
  // o1-mini pricing per Standard tier
  ...modelsWithCost(['o1-mini', 'o1-mini-2024-09-12'], {
    input: 1.1 / 1e6,
    output: 4.4 / 1e6,
  }),
  ...modelsWithCost(['o3', 'o3-2025-04-16'], {
    input: 2 / 1e6,
    output: 8 / 1e6,
  }),
  ...modelsWithCost(['o3-mini', 'o3-mini-2025-01-31'], {
    input: 1.1 / 1e6,
    output: 4.4 / 1e6,
  }),
  ...modelsWithCost(['gpt-4o', 'gpt-4o-2024-11-20', 'gpt-4o-2024-08-06'], {
    input: 2.5 / 1e6,
    output: 10 / 1e6,
  }),
  ...modelsWithCost(['gpt-4o-2024-05-13'], {
    input: 5 / 1e6,
    output: 15 / 1e6,
  }),
  ...modelsWithCost(['gpt-4o-mini', 'gpt-4o-mini-2024-07-18'], {
    input: 0.15 / 1e6,
    output: 0.6 / 1e6,
  }),
  ...modelsWithCost(['gpt-4', 'gpt-4-0613', 'gpt-4-0314'], {
    input: 30 / 1e6,
    output: 60 / 1e6,
  }),
  ...modelsWithCost(['gpt-4-32k', 'gpt-4-32k-0314', 'gpt-4-32k-0613'], {
    input: 60 / 1e6,
    output: 120 / 1e6,
  }),
  ...modelsWithCost(
    [
      'gpt-4-turbo',
      'gpt-4-turbo-2024-04-09',
      'gpt-4-turbo-preview',
      'gpt-4-0125-preview',
      'gpt-4-1106-preview',
      'gpt-4-1106-vision-preview',
      'gpt-4-vision-preview',
    ],
    {
      input: 10 / 1e6,
      output: 30 / 1e6,
    },
  ),
  ...modelsWithCost(['gpt-3.5-turbo'], {
    input: 0.5 / 1e6,
    output: 1.5 / 1e6,
  }),
  ...modelsWithCost(['gpt-3.5-turbo-0125'], {
    input: 0.5 / 1e6,
    output: 1.5 / 1e6,
  }),
  ...modelsWithCost(['gpt-3.5-turbo-1106'], {
    input: 1 / 1e6,
    output: 2 / 1e6,
  }),
  ...modelsWithCost(['gpt-3.5-turbo-0301', 'gpt-3.5-turbo-0613'], {
    input: 1.5 / 1e6,
    output: 2 / 1e6,
  }),
  ...modelsWithCost(['gpt-3.5-turbo-16k', 'gpt-3.5-turbo-16k-0613'], {
    input: 3 / 1e6,
    output: 4 / 1e6,
  }),
  ...modelsWithCost(['o4-mini', 'o4-mini-2025-04-16'], {
    input: 1.1 / 1e6,
    output: 4.4 / 1e6,
  }),
  // GPT-5 models
  ...modelsWithCost(['gpt-5', 'gpt-5-2025-08-07', 'gpt-5-chat', 'gpt-5-chat-latest'], {
    input: 1.25 / 1e6,
    output: 10 / 1e6,
  }),
  ...modelsWithCost(['gpt-5-nano', 'gpt-5-nano-2025-08-07'], {
    input: 0.05 / 1e6,
    output: 0.4 / 1e6,
  }),
  ...modelsWithCost(['gpt-5-mini', 'gpt-5-mini-2025-08-07'], {
    input: 0.25 / 1e6,
    output: 2 / 1e6,
  }),
  ...modelsWithCost(['codex-mini-latest'], {
    input: 1.5 / 1e6,
    output: 6.0 / 1e6,
  }),
  // GPT-5.1 models
  ...modelsWithCost(['gpt-5.1', 'gpt-5.1-2025-11-13', 'gpt-5.1-chat-latest'], {
    input: 1.25 / 1e6,
    output: 10 / 1e6,
  }),
  // GPT-5.2 models
  ...modelsWithCost(['gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-5.2-chat-latest'], {
    input: 1.75 / 1e6,
    output: 14 / 1e6,
  }),
  // GPT-5.3 models
  ...modelsWithCost(['gpt-5.3-chat-latest'], {
    input: 1.75 / 1e6,
    output: 14 / 1e6,
  }),
  ...modelsWithCost(['gpt-6-astra'], {
    input: 10 / 1e6,
    output: 50 / 1e6,
    longContext: {
      threshold: GPT_LONG_CONTEXT_THRESHOLD,
      input: 20 / 1e6,
      output: 75 / 1e6,
    },
  }),
  ...modelsWithCost(['gpt-6-sol', 'gpt-6.1-sol'], {
    input: 2 / 1e6,
    output: 10 / 1e6,
    longContext: {
      threshold: GPT_LONG_CONTEXT_THRESHOLD,
      input: 4 / 1e6,
      output: 15 / 1e6,
    },
  }),
  ...modelsWithCost(['gpt-6-luna'], {
    input: 0.1 / 1e6,
    output: 0.5 / 1e6,
    longContext: {
      threshold: GPT_LONG_CONTEXT_THRESHOLD,
      input: 0.2 / 1e6,
      output: 0.75 / 1e6,
    },
  }),
  // GPT-5.6 models
  ...modelsWithCost(['gpt-5.6', 'gpt-5.6-sol'], {
    input: 4 / 1e6,
    output: 20 / 1e6,
    longContext: {
      threshold: GPT_LONG_CONTEXT_THRESHOLD,
      input: 8 / 1e6,
      output: 30 / 1e6,
    },
  }),
  ...modelsWithCost(['gpt-5.6-terra'], {
    input: 2 / 1e6,
    output: 12 / 1e6,
    longContext: {
      threshold: GPT_LONG_CONTEXT_THRESHOLD,
      input: 4 / 1e6,
      output: 18 / 1e6,
    },
  }),
  ...modelsWithCost(['gpt-5.6-luna'], {
    input: 0.2 / 1e6,
    output: 1.2 / 1e6,
    longContext: {
      threshold: GPT_LONG_CONTEXT_THRESHOLD,
      input: 0.4 / 1e6,
      output: 1.8 / 1e6,
    },
  }),
  // GPT-5.5 models
  ...modelsWithCost(['gpt-5.5', 'gpt-5.5-2026-04-23'], {
    input: 5 / 1e6,
    output: 30 / 1e6,
    longContext: {
      threshold: GPT_LONG_CONTEXT_THRESHOLD,
      input: 10 / 1e6,
      output: 45 / 1e6,
    },
  }),
  // GPT-5.4 models
  ...modelsWithCost(['gpt-5.4', 'gpt-5.4-2026-03-05'], {
    input: 2.5 / 1e6,
    output: 15 / 1e6,
    longContext: {
      threshold: GPT_LONG_CONTEXT_THRESHOLD,
      input: 5 / 1e6,
      output: 22.5 / 1e6,
    },
  }),
  ...modelsWithCost(['gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17'], {
    input: 0.75 / 1e6,
    output: 4.5 / 1e6,
  }),
  ...modelsWithCost(['gpt-5.4-nano', 'gpt-5.4-nano-2026-03-17'], {
    input: 0.2 / 1e6,
    output: 1.25 / 1e6,
  }),
  // gpt-audio models
  ...modelsWithCost(['gpt-audio', 'gpt-audio-2025-08-28', 'gpt-audio-1.5'], {
    input: 2.5 / 1e6,
    output: 10 / 1e6,
    audioInput: 32 / 1e6,
    audioOutput: 64 / 1e6,
  }),
  ...modelsWithCost(['gpt-audio-mini', 'gpt-audio-mini-2025-12-15', 'gpt-audio-mini-2025-10-06'], {
    input: 0.6 / 1e6,
    output: 2.4 / 1e6,
    audioInput: 10 / 1e6,
    audioOutput: 20 / 1e6,
  }),
];

// Retired previews remain for historical billing; the dated mini preview remains routable until
// OpenAI publishes its shutdown date.
const LEGACY_OPENAI_AUDIO_MODELS: OpenAIModelInfo[] = [
  ...modelsWithCost(
    [
      'gpt-4o-audio-preview',
      'gpt-4o-audio-preview-2024-12-17',
      'gpt-4o-audio-preview-2024-10-01',
      'gpt-4o-audio-preview-2025-06-03',
    ],
    {
      input: 2.5 / 1e6,
      output: 10 / 1e6,
      audioInput: 40 / 1e6,
      audioOutput: 80 / 1e6,
    },
  ),
  ...modelsWithCost(['gpt-4o-mini-audio-preview', 'gpt-4o-mini-audio-preview-2024-12-17'], {
    input: 0.15 / 1e6,
    output: 0.6 / 1e6,
    audioInput: 10 / 1e6,
    audioOutput: 20 / 1e6,
  }),
];

export const OPENAI_CHAT_MODELS = excludeRetiredModels([
  ...OPENAI_CHAT_AND_RETIRED_MODELS,
  ...LEGACY_OPENAI_AUDIO_MODELS,
]);

export const OPENAI_CODEX_ONLY_MODELS: OpenAIModelInfo[] = [{ id: 'gpt-5.3-codex-spark' }];

const OPENAI_FIRST_PARTY_API_HOSTNAMES = new Set([
  'api.openai.com',
  'us.api.openai.com',
  'eu.api.openai.com',
  'au.api.openai.com',
  'ca.api.openai.com',
  'jp.api.openai.com',
  'in.api.openai.com',
  'sg.api.openai.com',
  'kr.api.openai.com',
  'gb.api.openai.com',
  'ae.api.openai.com',
]);

export function isOpenAiFirstPartyApiUrl(apiUrl?: string): boolean {
  if (!apiUrl) {
    return true;
  }
  try {
    return OPENAI_FIRST_PARTY_API_HOSTNAMES.has(new URL(apiUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeOpenAiBillingModelName(modelName: string): string {
  if (modelName.startsWith('openai/')) {
    return modelName.slice('openai/'.length);
  }
  if (modelName.startsWith('github/openai/')) {
    return modelName.slice('github/openai/'.length);
  }
  return modelName;
}

export function getOpenAiEffectiveServiceTier<TServiceTier extends string | null | undefined>(
  providerConfig: { service_tier?: TServiceTier; passthrough?: object },
  promptConfig?: { service_tier?: TServiceTier; passthrough?: object },
): TServiceTier | undefined {
  const promptPassthroughServiceTier = (
    promptConfig?.passthrough as { service_tier?: TServiceTier } | undefined
  )?.service_tier;
  const providerPassthroughServiceTier = (
    providerConfig.passthrough as { service_tier?: TServiceTier } | undefined
  )?.service_tier;

  if (promptPassthroughServiceTier !== undefined) {
    return promptPassthroughServiceTier;
  }
  if (promptConfig?.service_tier !== undefined) {
    return promptConfig.service_tier;
  }
  if (promptConfig && Object.prototype.hasOwnProperty.call(promptConfig, 'passthrough')) {
    return providerConfig.service_tier;
  }
  return providerPassthroughServiceTier === undefined
    ? providerConfig.service_tier
    : providerPassthroughServiceTier;
}

export function normalizeOpenAiServiceTierForWire(
  serviceTier: string | null | undefined,
  apiUrl?: string,
): string | null | undefined {
  return serviceTier === 'fast' && isOpenAiFirstPartyApiUrl(apiUrl) ? 'priority' : serviceTier;
}

export function assertOpenAiModelEndpointCompatibility(
  model: unknown,
  options: { allowTranscription?: boolean } = {},
): void {
  if (typeof model !== 'string') {
    return;
  }

  const normalizedModel = model.split('/').pop() ?? model;
  if (
    normalizedModel === 'gpt-live-transcribe' ||
    normalizedModel.startsWith('gpt-live-transcribe-')
  ) {
    throw new Error(
      'OpenAI model "gpt-live-transcribe" requires Realtime transcription sessions, which are not yet supported by promptfoo.',
    );
  }
  if (normalizedModel.startsWith('gpt-live-')) {
    throw new Error(`Use openai:live:${model} for GPT-Live sessions.`);
  }
  if (normalizedModel === 'gpt-transcribe' && !options.allowTranscription) {
    throw new Error(
      'OpenAI model "gpt-transcribe" is transcription-only. Use openai:transcription:gpt-transcribe (or bare openai:gpt-transcribe).',
    );
  }
}

export function assertOpenAiApiModel(
  model: unknown,
  apiUrl?: string,
  options: { allowTranscription?: boolean } = {},
): void {
  if (typeof model !== 'string') {
    return;
  }

  if (!isOpenAiFirstPartyApiUrl(apiUrl)) {
    return;
  }

  assertOpenAiModelEndpointCompatibility(model, options);
  const normalizedModel = model.split('/').pop() ?? model;
  if (RETIRED_OPENAI_MODEL_IDS.has(normalizedModel)) {
    throw new Error(
      `OpenAI model ${model} has been retired and is no longer available from OpenAI's first-party API. Use a current model or configure a custom OpenAI-compatible apiBaseUrl.`,
    );
  }
  if (OPENAI_CODEX_ONLY_MODELS.some((candidate) => candidate.id === normalizedModel)) {
    throw new Error(
      `OpenAI model ${model} is only available through openai:codex-sdk with eligible Codex authentication.`,
    );
  }
}

const OPENAI_RESPONSES_ONLY_AND_RETIRED_MODELS: OpenAIModelInfo[] = [
  ...modelsWithCost(['computer-use-preview', 'computer-use-preview-2025-03-11'], {
    input: 3 / 1e6,
    output: 12 / 1e6,
  }),
  ...modelsWithCost(['o1-pro', 'o1-pro-2025-03-19'], {
    input: 150 / 1e6,
    output: 600 / 1e6,
  }),
  ...modelsWithCost(['o3-pro', 'o3-pro-2025-06-10'], {
    input: 20 / 1e6,
    output: 80 / 1e6,
  }),
  ...modelsWithCost(['gpt-5-codex'], {
    input: 1.25 / 1e6,
    output: 10 / 1e6,
  }),
  ...modelsWithCost(['gpt-5-codex-mini'], {
    input: 0.5 / 1e6,
    output: 2 / 1e6,
  }),
  ...modelsWithCost(['gpt-5-pro', 'gpt-5-pro-2025-10-06'], {
    input: 15 / 1e6,
    output: 120 / 1e6,
  }),
  ...modelsWithCost(['gpt-5.1-codex', 'gpt-5.1-codex-max'], {
    input: 1.25 / 1e6,
    output: 10 / 1e6,
  }),
  ...modelsWithCost(['gpt-5.1-codex-mini'], {
    input: 0.25 / 1e6,
    output: 2 / 1e6,
  }),
  ...modelsWithCost(['gpt-5.2-codex', 'gpt-5.3-codex'], {
    input: 1.75 / 1e6,
    output: 14 / 1e6,
  }),
  ...modelsWithCost(['gpt-5.2-pro', 'gpt-5.2-pro-2025-12-11'], {
    input: 21 / 1e6,
    output: 168 / 1e6,
  }),
  ...modelsWithCost(['gpt-5.4-pro', 'gpt-5.4-pro-2026-03-05'], {
    input: 30 / 1e6,
    output: 180 / 1e6,
    longContext: {
      threshold: GPT_LONG_CONTEXT_THRESHOLD,
      input: 60 / 1e6,
      output: 270 / 1e6,
    },
  }),
  // GPT-5.5 Pro is Responses-only
  ...modelsWithCost(['gpt-5.5-pro', 'gpt-5.5-pro-2026-04-23'], {
    input: 30 / 1e6,
    output: 180 / 1e6,
    longContext: {
      threshold: GPT_LONG_CONTEXT_THRESHOLD,
      input: 60 / 1e6,
      output: 270 / 1e6,
    },
  }),
];
export const OPENAI_RESPONSES_ONLY_MODELS = excludeRetiredModels(
  OPENAI_RESPONSES_ONLY_AND_RETIRED_MODELS,
);

// Deep research models for Responses API
const OPENAI_DEEP_RESEARCH_AND_RETIRED_MODELS: OpenAIModelInfo[] = [
  ...modelsWithCost(['o3-deep-research', 'o3-deep-research-2025-06-26'], {
    input: 10 / 1e6,
    output: 40 / 1e6,
  }),
  ...modelsWithCost(['o4-mini-deep-research', 'o4-mini-deep-research-2025-06-26'], {
    input: 2 / 1e6,
    output: 8 / 1e6,
  }),
];
/** @deprecated Historical billing metadata only; these native models retired July 23, 2026. */
export const OPENAI_DEEP_RESEARCH_MODELS = OPENAI_DEEP_RESEARCH_AND_RETIRED_MODELS;

// See https://platform.openai.com/docs/models/model-endpoint-compatibility
export const OPENAI_COMPLETION_MODELS: OpenAIModelInfo[] = [
  ...modelsWithCost(['gpt-3.5-turbo-instruct'], {
    input: 1.5 / 1e6,
    output: 2 / 1e6,
  }),
  ...modelsWithCost(['gpt-3.5-turbo-instruct-0914'], {
    input: 1.5 / 1e6,
    output: 2 / 1e6,
  }),
  ...modelsWithCost(['babbage-002'], {
    input: 0.4 / 1e6,
    output: 0.4 / 1e6,
  }),
  ...modelsWithCost(['davinci-002'], {
    input: 2 / 1e6,
    output: 2 / 1e6,
  }),
];

/**
 * Realtime model IDs that exist on a different endpoint family from the conversational
 * Realtime API and therefore must NOT be routed through `openai:realtime:<model>`.
 *
 * - `gpt-realtime-translate` uses a dedicated translation-session endpoint.
 * - `gpt-realtime-whisper` is a transcription-only model intended to be passed as
 *   `input_audio_transcription.model` inside a conversational session, not used as a
 *   standalone provider.
 * - `gpt-transcribe` and `gpt-live-transcribe` use Realtime transcription sessions,
 *   whose event flow differs from conversational Realtime sessions.
 *
 * Used by the provider routing layer to fail-fast with a clear error rather than
 * silently exchanging an empty response over the wrong wire shape.
 */
export const NON_CONVERSATIONAL_REALTIME_MODELS: ReadonlySet<string> = new Set([
  'gpt-realtime-translate',
  'gpt-realtime-whisper',
  'gpt-transcribe',
  'gpt-live-transcribe',
]);

// Realtime models for WebSocket API
const OPENAI_REALTIME_AND_RETIRED_MODELS: OpenAIModelInfo[] = [
  // GA gpt-realtime models
  ...realtimeModelsWithCost(['gpt-realtime', 'gpt-realtime-2025-08-28', 'gpt-realtime-1.5'], {
    input: 4 / 1e6,
    output: 16 / 1e6,
    audioInput: 32 / 1e6,
    audioOutput: 64 / 1e6,
  }),
  ...realtimeModelsWithCost(['gpt-realtime-2'], {
    input: 4 / 1e6,
    output: 24 / 1e6,
    audioInput: 32 / 1e6,
    audioOutput: 64 / 1e6,
  }),
  ...realtimeModelsWithCost(['gpt-realtime-2.1'], {
    input: 4 / 1e6,
    output: 24 / 1e6,
    audioInput: 32 / 1e6,
    audioOutput: 64 / 1e6,
  }),
  ...realtimeModelsWithCost(['gpt-realtime-2.1-mini'], {
    input: 0.6 / 1e6,
    output: 2.4 / 1e6,
    audioInput: 10 / 1e6,
    audioOutput: 20 / 1e6,
  }),
  // Deprecated preview snapshot; OpenAI has not published a shutdown date.
  ...realtimeModelsWithCost(['gpt-4o-mini-realtime-preview-2024-12-17'], {
    input: 0.6 / 1e6,
    output: 2.4 / 1e6,
    audioInput: 10 / 1e6,
    audioOutput: 20 / 1e6,
  }),
  // gpt-realtime-mini models
  ...realtimeModelsWithCost(
    ['gpt-realtime-mini', 'gpt-realtime-mini-2025-12-15', 'gpt-realtime-mini-2025-10-06'],
    {
      input: 0.6 / 1e6,
      output: 2.4 / 1e6,
      audioInput: 10 / 1e6,
      audioOutput: 20 / 1e6,
    },
  ),
];

// Retired previews preserved only for historical billing.
const RETIRED_OPENAI_REALTIME_MODELS: OpenAIModelInfo[] = [
  ...realtimeModelsWithCost(['gpt-4o-realtime-preview'], {
    input: 5 / 1e6,
    output: 20 / 1e6,
    audioInput: 40 / 1e6,
    audioOutput: 80 / 1e6,
  }),
  ...realtimeModelsWithCost(['gpt-4o-realtime-preview-2024-12-17'], {
    input: 5 / 1e6,
    output: 20 / 1e6,
    audioInput: 40 / 1e6,
    audioOutput: 80 / 1e6,
  }),
  ...realtimeModelsWithCost(['gpt-4o-realtime-preview-2025-06-03'], {
    input: 5 / 1e6,
    output: 20 / 1e6,
    audioInput: 40 / 1e6,
    audioOutput: 80 / 1e6,
  }),
  ...realtimeModelsWithCost(['gpt-4o-realtime-preview-2024-10-01'], {
    input: 5 / 1e6,
    output: 20 / 1e6,
    audioInput: 100 / 1e6,
    audioOutput: 200 / 1e6,
  }),
  ...realtimeModelsWithCost(['gpt-4o-mini-realtime-preview'], {
    input: 0.6 / 1e6,
    output: 2.4 / 1e6,
    audioInput: 10 / 1e6,
    audioOutput: 20 / 1e6,
  }),
];

export const OPENAI_REALTIME_MODELS = excludeRetiredModels([
  ...OPENAI_REALTIME_AND_RETIRED_MODELS,
  ...RETIRED_OPENAI_REALTIME_MODELS,
]);

export type RetiredOpenAiModelRoute = 'chat' | 'moderation' | 'responses' | 'tts' | 'realtime';

/**
 * Returns the endpoint family historically used by a retired model ID, including gateway prefixes.
 *
 * First-party calls are rejected by {@link assertOpenAiApiModel}; this route is used only after
 * that guard allows a custom OpenAI-compatible endpoint.
 */
export function getRetiredOpenAiModelRoute(modelName: string): RetiredOpenAiModelRoute | undefined {
  const modelId = modelName.split('/').pop() ?? modelName;
  if (!RETIRED_OPENAI_MODEL_IDS.has(modelId)) {
    return undefined;
  }
  if (
    OPENAI_CHAT_AND_RETIRED_MODELS.some(({ id }) => id === modelId) ||
    LEGACY_OPENAI_AUDIO_MODELS.some(({ id }) => id === modelId)
  ) {
    return 'chat';
  }
  if (OPENAI_TTS_AND_RETIRED_MODELS.some(({ id }) => id === modelId)) {
    return 'tts';
  }
  if (
    OPENAI_REALTIME_AND_RETIRED_MODELS.some(({ id }) => id === modelId) ||
    RETIRED_OPENAI_REALTIME_MODELS.some(({ id }) => id === modelId)
  ) {
    return 'realtime';
  }
  if (modelId.startsWith('text-moderation-')) {
    return 'moderation';
  }
  if (
    OPENAI_RESPONSES_ONLY_AND_RETIRED_MODELS.some(({ id }) => id === modelId) ||
    OPENAI_DEEP_RESEARCH_AND_RETIRED_MODELS.some(({ id }) => id === modelId)
  ) {
    return 'responses';
  }
  return undefined;
}

export const OPENAI_BILLING_MODELS: OpenAIModelInfo[] = [
  ...OPENAI_CHAT_AND_RETIRED_MODELS,
  ...OPENAI_TTS_AND_RETIRED_MODELS,
  ...LEGACY_OPENAI_AUDIO_MODELS,
  ...OPENAI_COMPLETION_MODELS,
  ...OPENAI_REALTIME_AND_RETIRED_MODELS,
  ...RETIRED_OPENAI_REALTIME_MODELS,
  ...OPENAI_RESPONSES_ONLY_AND_RETIRED_MODELS,
  ...OPENAI_CODEX_ONLY_MODELS,
  ...OPENAI_DEEP_RESEARCH_AND_RETIRED_MODELS,
];

// Transcription models for /v1/audio/transcriptions endpoint
export const OPENAI_TRANSCRIPTION_MODELS: Array<{
  id: string;
  cost: { perMinute: number; input?: number; audioInput?: number; output?: number };
}> = [
  ...transcriptionModelsWithCost(['gpt-transcribe'], {
    perMinute: 0.0045,
  }),
  ...transcriptionModelsWithCost(['gpt-4o-transcribe'], {
    input: 2.5 / 1e6, // text tokens
    audioInput: 6 / 1e6, // audio tokens (~1000 audio tokens/min * $6/M = $0.006/min)
    output: 10 / 1e6,
    perMinute: 0.006, // $0.006 per minute
  }),
  ...transcriptionModelsWithCost(['gpt-4o-mini-transcribe'], {
    input: 1.25 / 1e6, // text tokens
    audioInput: 3 / 1e6, // audio tokens (~1000 audio tokens/min * $3/M = $0.003/min)
    output: 5 / 1e6,
    perMinute: 0.003, // $0.003 per minute
  }),
  ...transcriptionModelsWithCost(['gpt-4o-mini-transcribe-2025-12-15'], {
    input: 1.25 / 1e6,
    audioInput: 3 / 1e6,
    output: 5 / 1e6,
    perMinute: 0.003,
  }),
  ...transcriptionModelsWithCost(['gpt-4o-mini-transcribe-2025-03-20'], {
    input: 1.25 / 1e6,
    audioInput: 3 / 1e6,
    output: 5 / 1e6,
    perMinute: 0.003,
  }),
  ...transcriptionModelsWithCost(['gpt-4o-transcribe-diarize'], {
    input: 2.5 / 1e6,
    audioInput: 6 / 1e6,
    output: 10 / 1e6,
    perMinute: 0.006, // $0.006 per minute (same as base gpt-4o-transcribe)
  }),
  ...transcriptionModelsWithCost(['gpt-4o-transcribe-diarize-2025-10-15'], {
    input: 2.5 / 1e6,
    audioInput: 6 / 1e6,
    output: 10 / 1e6,
    perMinute: 0.006,
  }),
  ...transcriptionModelsWithCost(['whisper-1'], {
    perMinute: 0.006, // $0.006 per minute
  }),
];

export function calculateOpenAICost(
  modelName: string,
  config: ProviderConfig,
  promptTokens?: number,
  completionTokens?: number,
  audioPromptTokens?: number,
  audioCompletionTokens?: number,
): number | undefined {
  if (audioPromptTokens === undefined && audioCompletionTokens === undefined) {
    return calculateCost(modelName, config, promptTokens, completionTokens, OPENAI_BILLING_MODELS);
  }

  // Calculate with audio tokens
  if (
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens) ||
    !Number.isFinite(audioPromptTokens) ||
    !Number.isFinite(audioCompletionTokens) ||
    typeof promptTokens === 'undefined' ||
    typeof completionTokens === 'undefined' ||
    typeof audioPromptTokens === 'undefined' ||
    typeof audioCompletionTokens === 'undefined'
  ) {
    return undefined;
  }

  const model = OPENAI_BILLING_MODELS.find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return undefined;
  }

  const textCost = calculateCost(
    modelName,
    config,
    promptTokens,
    completionTokens,
    OPENAI_BILLING_MODELS,
  );
  if (textCost === undefined) {
    return undefined;
  }
  let totalCost = textCost;

  if ('audioInput' in model.cost || 'audioOutput' in model.cost) {
    const modelAudioInputCost: number =
      'audioInput' in model.cost && typeof model.cost.audioInput === 'number'
        ? model.cost.audioInput
        : 0;
    const modelAudioOutputCost: number =
      'audioOutput' in model.cost && typeof model.cost.audioOutput === 'number'
        ? model.cost.audioOutput
        : 0;
    const audioInputCost = config.audioInputCost ?? config.audioCost ?? modelAudioInputCost;
    const audioOutputCost = config.audioOutputCost ?? config.audioCost ?? modelAudioOutputCost;
    totalCost += audioInputCost * audioPromptTokens + audioOutputCost * audioCompletionTokens;
  }

  return totalCost;
}

/**
 * Calculate cost without trusting provider-controlled usage or cost fields.
 */
export function calculateSafeOpenAICost(
  modelName: string,
  config: ProviderConfig,
  data: any,
): number | undefined {
  const promptTokens = data?.usage?.prompt_tokens;
  const completionTokens = data?.usage?.completion_tokens;
  const localCost =
    isSafeTokenCount(promptTokens) && isSafeTokenCount(completionTokens)
      ? calculateOpenAICost(modelName, config, promptTokens, completionTokens)
      : undefined;
  const hasLocalOverride =
    config.cost !== undefined || config.inputCost !== undefined || config.outputCost !== undefined;
  if (hasLocalOverride) {
    if (isSafeCost(localCost)) {
      return localCost;
    }
    const inputCost = config.inputCost ?? config.cost;
    const outputCost = config.outputCost ?? config.cost;
    if (
      isSafeTokenCount(promptTokens) &&
      isSafeTokenCount(completionTokens) &&
      isSafeCost(inputCost) &&
      isSafeCost(outputCost)
    ) {
      const configuredCost = inputCost * promptTokens + outputCost * completionTokens;
      return isSafeCost(configuredCost) ? configuredCost : undefined;
    }
    return undefined;
  }
  return isSafeCost(data?.usage?.cost)
    ? data.usage.cost
    : isSafeCost(localCost)
      ? localCost
      : undefined;
}

export function failApiCall(err: any) {
  if (err instanceof OpenAI.APIError) {
    const errorType = err.error?.type || err.type || 'unknown';
    const errorMessage = err.error?.message || err.message || 'Unknown error';
    const statusCode = err.status ? ` ${err.status}` : '';
    return {
      error: `API error: ${errorType}${statusCode} ${errorMessage}`,
    };
  }
  return {
    error: `API error: ${String(err)}`,
  };
}

export function getOpenAICacheWriteInputTokens(usage: any): number | undefined {
  for (const value of [
    usage?.prompt_tokens_details?.cache_write_tokens,
    usage?.input_tokens_details?.cache_write_tokens,
    usage?.input_token_details?.cache_write_tokens,
    usage?.cache_write_input_tokens,
  ]) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return undefined;
}

export function getOpenAICompletionTokenDetails(
  usage: any,
): TokenUsage['completionDetails'] | undefined {
  // Some OpenAI-compatible APIs (e.g. Moonshot) report cached prompt tokens at
  // the top level of usage instead of inside prompt_tokens_details.
  const cachedInputTokens =
    usage.prompt_tokens_details?.cached_tokens ??
    usage.input_tokens_details?.cached_tokens ??
    usage.cached_tokens ??
    0;
  const cacheWriteInputTokens = getOpenAICacheWriteInputTokens(usage);
  const completionDetails = usage.completion_tokens_details ?? usage.output_tokens_details;

  if (!completionDetails && cachedInputTokens <= 0 && cacheWriteInputTokens === undefined) {
    return undefined;
  }

  return {
    ...(completionDetails
      ? {
          reasoning: completionDetails.reasoning_tokens,
          acceptedPrediction: completionDetails.accepted_prediction_tokens,
          rejectedPrediction: completionDetails.rejected_prediction_tokens,
        }
      : {}),
    ...(cachedInputTokens > 0 ? { cacheReadInputTokens: cachedInputTokens } : {}),
    ...(cacheWriteInputTokens === undefined
      ? {}
      : { cacheCreationInputTokens: cacheWriteInputTokens }),
  };
}

export function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (!isRecord(data?.usage)) {
    return {};
  }

  const usage = data.usage;
  const total = isSafeTokenCount(usage.total_tokens) ? usage.total_tokens : undefined;
  if (cached) {
    return total === undefined ? {} : { cached: total, total };
  }

  const tokenUsage: Partial<TokenUsage> = { numRequests: 1 };
  if (total !== undefined) {
    tokenUsage.total = total;
  }
  tokenUsage.prompt = isSafeTokenCount(usage.prompt_tokens) ? usage.prompt_tokens : 0;
  tokenUsage.completion = isSafeTokenCount(usage.completion_tokens) ? usage.completion_tokens : 0;

  const promptDetails = isRecord(usage.prompt_tokens_details)
    ? usage.prompt_tokens_details
    : isRecord(usage.input_tokens_details)
      ? usage.input_tokens_details
      : undefined;
  const completionDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : isRecord(usage.output_tokens_details)
      ? usage.output_tokens_details
      : undefined;
  const details: NonNullable<TokenUsage['completionDetails']> = {};
  const detailMappings = [
    ['reasoning', completionDetails?.reasoning_tokens],
    ['acceptedPrediction', completionDetails?.accepted_prediction_tokens],
    ['rejectedPrediction', completionDetails?.rejected_prediction_tokens],
    // Some OpenAI-compatible APIs (e.g. Moonshot) report cached prompt tokens at the
    // top level of usage instead of inside prompt_tokens_details. Nested details win.
    ['cacheReadInputTokens', promptDetails?.cached_tokens ?? usage.cached_tokens],
    ['cacheCreationInputTokens', getOpenAICacheWriteInputTokens(usage)],
  ] as const;
  for (const [field, value] of detailMappings) {
    if (isSafeTokenCount(value)) {
      details[field] = value;
    }
  }
  if (Object.keys(details).length > 0) {
    tokenUsage.completionDetails = details;
  }
  return tokenUsage;
}

export function getTokenUsageWithRequestCount(data: any, cached: boolean): Partial<TokenUsage> {
  return { ...getTokenUsage(data, cached), numRequests: cached ? 0 : 1 };
}

export interface ValidatedChatCompletionMessage {
  audio: Record<string, unknown> | undefined;
  content: string | null | undefined;
  functionCall: Record<string, unknown> | undefined;
  reasoning: string | undefined;
  refusal: string | undefined;
  structuredContent: Record<string, unknown>[] | undefined;
  toolCalls: Record<string, unknown>[] | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasNamedPayload(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.name === 'string' && value.name.trim().length > 0;
}

function hasFunctionPayload(value: unknown): value is Record<string, unknown> {
  return hasNamedPayload(value) && typeof value.arguments === 'string';
}

function isToolCall(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return false;
  }
  return (
    // OpenRouter sometimes omits the discriminator on a complete function
    // payload; treat it as 'function' rather than discarding the message.
    // An explicit unknown type still fails, and `custom` keeps its own shape.
    ((value.type === 'function' || value.type === undefined) &&
      hasFunctionPayload(value.function)) ||
    (value.type === 'custom' &&
      hasNamedPayload(value.custom) &&
      typeof value.custom.input === 'string')
  );
}

function hasUrlPayload(value: unknown): boolean {
  return isRecord(value) && typeof value.url === 'string' && value.url.trim().length > 0;
}

function isStructuredContentPart(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case 'text':
      return typeof value.text === 'string' && value.text.trim().length > 0;
    case 'image_url':
      return hasUrlPayload(value.image_url);
    default:
      return false;
  }
}

/**
 * Validate the response fields that providers inspect before returning a completion.
 */
export function validateChatCompletionMessage(
  value: unknown,
  options: { allowAudio?: boolean; allowStructuredContent?: boolean; finishReason?: string } = {},
): ValidatedChatCompletionMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const functionCall = hasFunctionPayload(value.function_call) ? value.function_call : undefined;
  if (value.function_call != null && !functionCall) {
    return undefined;
  }

  if (
    value.tool_calls != null &&
    (!Array.isArray(value.tool_calls) || !value.tool_calls.every(isToolCall))
  ) {
    return undefined;
  }
  const toolCalls =
    Array.isArray(value.tool_calls) && value.tool_calls.length > 0 ? value.tool_calls : undefined;

  const hasContent = Object.prototype.hasOwnProperty.call(value, 'content');
  const content =
    value.content === null || typeof value.content === 'string' ? value.content : undefined;
  const structuredContent =
    options.allowStructuredContent &&
    Array.isArray(value.content) &&
    value.content.every(isStructuredContentPart)
      ? value.content
      : undefined;
  if (hasContent && content === undefined && structuredContent === undefined) {
    return undefined;
  }

  // Audio models answer with `content: null` plus an audio payload; accept it
  // only where the caller knows how to surface it.
  const audio =
    options.allowAudio &&
    isRecord(value.audio) &&
    (typeof value.audio.transcript === 'string' || typeof value.audio.data === 'string')
      ? value.audio
      : undefined;

  const reasoning =
    typeof value.reasoning === 'string' && value.reasoning.trim() ? value.reasoning : undefined;
  const hasUsableContent =
    (typeof content === 'string' && content.trim().length > 0) ||
    (structuredContent !== undefined && structuredContent.length > 0);
  const refusal =
    typeof value.refusal === 'string' && value.refusal.trim().length > 0
      ? value.refusal
      : undefined;
  if (
    !functionCall &&
    !toolCalls &&
    !hasUsableContent &&
    audio === undefined &&
    reasoning === undefined &&
    !refusal &&
    options.finishReason !== 'content_filter'
  ) {
    return undefined;
  }

  return {
    audio,
    content,
    functionCall,
    reasoning,
    refusal,
    structuredContent,
    toolCalls,
  };
}

export function getChatCompletionRefusal(
  message: ValidatedChatCompletionMessage,
  finishReason: string | undefined,
): { output: string; isRefusal: true; guardrails: { flagged: true } } | undefined {
  if (message.refusal) {
    return { output: message.refusal, isRefusal: true, guardrails: { flagged: true } };
  }
  if (finishReason === 'content_filter') {
    return {
      output:
        typeof message.content === 'string' && message.content.trim()
          ? message.content
          : 'Content filtered by provider',
      isRefusal: true,
      guardrails: { flagged: true },
    };
  }
  return undefined;
}

/**
 * Parse the raw completion content as JSON, falling back to `output` when the
 * payload is absent or unparseable. `logLabel` prefixes the warning emitted on
 * a parse failure.
 */
export function parseChatCompletionJsonOutput(
  message: ValidatedChatCompletionMessage,
  output: string | object,
  logLabel: string,
): string | object {
  const jsonCandidate =
    typeof message.content === 'string'
      ? message.content
      : typeof output === 'string'
        ? output
        : undefined;
  if (!jsonCandidate) {
    return output;
  }
  try {
    return JSON.parse(jsonCandidate);
  } catch (error) {
    logger.warn(`${logLabel}: ${String(error)}`);
    return output;
  }
}

export interface OpenAiFunction {
  name: string;
  description?: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface OpenAiTool {
  type: 'function';
  function: OpenAiFunction;
}

export function validateFunctionCall(
  output: string | object,
  functions?: OpenAiFunction[],
  vars?: Record<string, VarValue>,
) {
  if (typeof output === 'object' && 'function_call' in output) {
    output = (output as { function_call: any }).function_call;
  }
  const functionCall = output as { arguments: string; name: string };
  if (
    typeof functionCall !== 'object' ||
    typeof functionCall.name !== 'string' ||
    typeof functionCall.arguments !== 'string'
  ) {
    throw new Error(
      `OpenAI did not return a valid-looking function call: ${JSON.stringify(functionCall)}`,
    );
  }

  // Parse function call and validate it against schema
  const interpolatedFunctions = maybeLoadFromExternalFileWithVars(
    functions,
    vars,
  ) as OpenAiFunction[];
  const functionArgs = JSON.parse(functionCall.arguments);
  const functionName = functionCall.name;
  const functionSchema = interpolatedFunctions?.find((f) => f.name === functionName)?.parameters;
  if (!functionSchema) {
    throw new Error(`Called "${functionName}", but there is no function with that name`);
  }
  const validate = getAjv().compile(functionSchema);
  if (!validate(functionArgs)) {
    throw new Error(
      `Call to "${functionName}" does not match schema: ${JSON.stringify(validate.errors)}`,
    );
  }
}

/** A completed provider error without a competing nonempty choice. */
export function isOpenAiErrorOnlyResponse(data: unknown): data is { error: { message: string } } {
  return (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'error' in data &&
    data.error !== null &&
    typeof data.error === 'object' &&
    !Array.isArray(data.error) &&
    'message' in data.error &&
    typeof data.error.message === 'string' &&
    (!('choices' in data) ||
      data.choices == null ||
      (Array.isArray(data.choices) && data.choices.length === 0))
  );
}

export function formatOpenAiError(data: {
  error: { message: string; type?: string; code?: string };
}): string {
  let errorMessage = `API error: ${data.error.message}`;
  if (data.error.type) {
    errorMessage += `, Type: ${data.error.type}`;
  }
  if (data.error.code) {
    errorMessage += `, Code: ${data.error.code}`;
  }
  errorMessage += '\n\n' + safeJsonStringify(data, true /* prettyPrint */);
  return errorMessage;
}

function realtimeModelsWithCost(ids: string[], cost: OpenAIModelCost): OpenAIModelInfo[] {
  return ids.map((id) => ({ id, type: 'chat', cost: { ...cost } }));
}

function modelsWithCost(ids: string[], cost: OpenAIModelCost): OpenAIModelInfo[] {
  return ids.map((id) => ({
    id,
    cost: {
      ...cost,
      ...(cost.longContext && { longContext: { ...cost.longContext } }),
    },
  }));
}

function transcriptionModelsWithCost(
  ids: string[],
  cost: (typeof OPENAI_TRANSCRIPTION_MODELS)[number]['cost'],
) {
  return ids.map((id) => ({ id, cost: { ...cost } }));
}

export function flattenResponseTool(tool: any) {
  if (tool?.type !== 'function' || !tool.function) {
    return tool;
  }
  const { function: functionDefinition, ...rest } = tool;
  return { ...rest, ...functionDefinition };
}
