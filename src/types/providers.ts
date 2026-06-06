import { z } from 'zod';
import type winston from 'winston';

import type { MinimalApiProvider } from '../contracts/prompts';
import type {
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderModerationResponse,
  ProviderResponse,
  ProviderSimilarityResponse,
} from '../contracts/providers';
import type { EnvOverrides } from './env';
import type { Prompt } from './prompts';
import type { Inputs, NunjucksFilterMap, TokenUsage, VarValue } from './shared';
import type { TransformFunction } from './transform';

export type {
  ChatMessage,
  GuardrailResponse,
  ImageOutput,
  ModerationFlag,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderModerationResponse,
  ProviderResponse,
  ProviderSimilarityResponse,
} from '../contracts/providers';
export type { TokenUsage } from './shared';
export type ProviderId = string;
export type ProviderLabel = string;
export type ProviderFunction = ApiProvider['callApi'];
export type ProviderOptionsMap = Record<ProviderId, ProviderOptions>;
export type ProviderConfig =
  | ProviderId
  | ProviderFunction
  | ApiProvider
  | ProviderOptions
  | ProviderOptionsMap;
export type ProvidersConfig = ProviderId | ProviderFunction | ApiProvider | ProviderConfig[];

export type ProviderType = 'embedding' | 'classification' | 'text' | 'moderation';

export interface SkillCallEntry {
  name: string;
  input?: unknown;
  path?: string;
  source?: 'heuristic' | 'tool';
  is_error?: boolean;
}

export type ProviderTypeMap = Partial<Record<ProviderType, string | ProviderOptions | ApiProvider>>;

// Local interface to avoid circular dependency with src/types/index.ts
interface AtomicTestCase {
  description?: string;
  vars?: Record<string, VarValue>;
  providerResponse?: ProviderResponse;
  tokenUsage?: TokenUsage;
  success?: boolean;
  score?: number;
  failureReason?: string;
  metadata?: Record<string, any>;
  options?: Record<string, any>;
}
export interface ProviderOptions {
  id?: ProviderId;
  label?: ProviderLabel;
  config?: any;
  prompts?: string[];
  transform?: string | TransformFunction;
  delay?: number;
  env?: EnvOverrides;
  inputs?: Inputs;
}

export interface CallApiContextParams {
  filters?: NunjucksFilterMap;
  getCache?: any;
  logger?: winston.Logger;
  originalProvider?: ApiProvider;
  prompt: Prompt;
  vars: Record<string, VarValue>;
  debug?: boolean;
  // This was added so we have access to the grader inside the provider.
  // Vars and prompts should be access using the arguments above.
  test?: AtomicTestCase;
  bustCache?: boolean;

  // W3C Trace Context headers
  traceparent?: string; // Format: version-trace-id-parent-id-trace-flags
  tracestate?: string; // Optional vendor-specific trace state

  // Evaluation metadata (for manual correlation if needed)
  evaluationId?: string;
  testCaseId?: string;
  /**
   * Index of the test case within the current evaluation (row in results table).
   * Used for correlating blob references and other per-result metadata.
   */
  testIdx?: number;
  /**
   * Index of the prompt within the current evaluation (column in results table).
   * Used for correlating blob references and other per-result metadata.
   */
  promptIdx?: number;
  repeatIndex?: number;
}

export interface CallApiOptionsParams {
  includeLogProbs?: boolean;
  /**
   * Signal that can be used to abort the request
   */
  abortSignal?: AbortSignal;
}

export interface ApiProvider extends MinimalApiProvider {
  callApi: CallApiFunction;
  callClassificationApi?: (prompt: string) => Promise<ProviderClassificationResponse>;
  callEmbeddingApi?: (input: string) => Promise<ProviderEmbeddingResponse>;
  config?: any;
  delay?: number;
  getSessionId?: () => string;
  inputs?: Inputs;
  label?: ProviderLabel;
  transform?: string | TransformFunction;
  toJSON?: () => any;
  /**
   * Provider-wide cleanup hook for releasing long-lived resources such as worker
   * processes, browser sessions, or pooled connections at eval shutdown.
   * Request-scoped cancellation should be implemented with `abortSignal`.
   */
  cleanup?: () => void | Promise<void>;
}

export interface ApiEmbeddingProvider extends ApiProvider {
  callEmbeddingApi: (input: string) => Promise<ProviderEmbeddingResponse>;
}

export interface ApiSimilarityProvider extends ApiProvider {
  callSimilarityApi: (reference: string, input: string) => Promise<ProviderSimilarityResponse>;
}

export interface ApiClassificationProvider extends ApiProvider {
  callClassificationApi: (prompt: string) => Promise<ProviderClassificationResponse>;
}

export interface ApiModerationProvider extends ApiProvider {
  callModerationApi: (prompt: string, response: string) => Promise<ProviderModerationResponse>;
}

export type FilePath = string;

export type CallApiFunction = {
  (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse>;
  label?: string;
};

export function isApiProvider(provider: any): provider is ApiProvider {
  return (
    typeof provider === 'object' &&
    provider != null &&
    'id' in provider &&
    typeof provider.id === 'function' &&
    'callApi' in provider &&
    typeof provider.callApi === 'function'
  );
}

export function isProviderOptions(provider: any): provider is ProviderOptions {
  return (
    typeof provider === 'object' &&
    provider != null &&
    'id' in provider &&
    typeof provider.id === 'string'
  );
}

export interface ProviderTestResponse {
  testResult: {
    message?: string;
    error?: string;
    changes_needed?: boolean;
    changes_needed_reason?: string;
    changes_needed_suggestions?: string[];
  };
  providerResponse: ProviderResponse;
  unalignedProviderResult?: ProviderResponse;
  redteamProviderResult?: ProviderResponse;
  transformedRequest?: any;
}

/**
 * Interface defining the default providers used by the application
 */
export interface DefaultProviders {
  embeddingProvider: ApiProvider;
  gradingJsonProvider: ApiProvider;
  gradingProvider: ApiProvider;
  llmRubricProvider?: ApiProvider;
  moderationProvider: ApiProvider;
  suggestionsProvider: ApiProvider;
  synthesizeProvider: ApiProvider;
  webSearchProvider?: ApiProvider;
}

/**
 * Information about a provider that was skipped during default provider selection
 */
export interface SkippedProviderInfo {
  /** The name of the provider (e.g., "OpenAI", "Anthropic") */
  name: string;
  /** The reason an available provider was skipped (e.g., "OpenAI has higher priority") */
  reason: string;
}

/**
 * Information about a selected default provider slot
 */
export interface DefaultProviderSlotInfo {
  /** The provider ID (e.g., "anthropic:messages:claude-sonnet-4-20250514") */
  id: string;
  /** The model name if applicable */
  model?: string;
}

/**
 * Information about how default providers were selected.
 * This provides visibility into the auto-detection logic.
 */
export interface DefaultProviderSelectionInfo {
  /** The name of the selected provider (e.g., "OpenAI", "Anthropic", "GitHub Models") */
  selectedProvider: string;
  /** Human-readable reason for the selection (e.g., "ANTHROPIC_API_KEY found, OPENAI_API_KEY not set") */
  reason: string;
  /** List of available credential sources detected for automatic provider selection */
  detectedCredentials: string[];
  /** List of providers that were skipped and why */
  skippedProviders: SkippedProviderInfo[];
  /** Information about which provider is assigned to each slot */
  providerSlots: {
    grading?: DefaultProviderSlotInfo;
    gradingJson?: DefaultProviderSlotInfo;
    embedding?: DefaultProviderSlotInfo;
    moderation?: DefaultProviderSlotInfo;
    suggestions?: DefaultProviderSlotInfo;
    synthesize?: DefaultProviderSlotInfo;
    llmRubric?: DefaultProviderSlotInfo;
    webSearch?: DefaultProviderSlotInfo;
  };
}

export const DefaultProviderSelectionInfoSchema = z.object({
  selectedProvider: z.string(),
  reason: z.string(),
  detectedCredentials: z.array(z.string()),
  skippedProviders: z.array(
    z.object({
      name: z.string(),
      reason: z.string(),
    }),
  ),
  providerSlots: z.object({
    grading: z.object({ id: z.string(), model: z.string().optional() }).optional(),
    gradingJson: z.object({ id: z.string(), model: z.string().optional() }).optional(),
    embedding: z.object({ id: z.string(), model: z.string().optional() }).optional(),
    moderation: z.object({ id: z.string(), model: z.string().optional() }).optional(),
    suggestions: z.object({ id: z.string(), model: z.string().optional() }).optional(),
    synthesize: z.object({ id: z.string(), model: z.string().optional() }).optional(),
    llmRubric: z.object({ id: z.string(), model: z.string().optional() }).optional(),
    webSearch: z.object({ id: z.string(), model: z.string().optional() }).optional(),
  }),
});

/**
 * Default providers bundled with selection metadata
 */
export interface DefaultProvidersWithInfo {
  /** The default provider instances */
  providers: DefaultProviders;
  /** Information about how providers were selected */
  selectionInfo: DefaultProviderSelectionInfo;
}
