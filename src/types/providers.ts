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

export interface RemoteGenerationContext {
  /** Provider IDs used for filtering, retry, and target identity. */
  providerTargetIds: string[];
  /** Cloud target database ID sent to Promptfoo Cloud task handlers. */
  cloudTargetId?: string;
}

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
   * Request-scoped cancellation, forwarded to supported transports, retries, and polling.
   * Legacy/custom providers may ignore this optional option; it does not cancel an accepted remote job.
   */
  abortSignal?: AbortSignal;
}

/** Identity and lifecycle shared by providers, independently of their operation. */
export interface ProviderIdentity<TConfig = unknown> {
  id(): string;
  config?: TConfig;
  /** Omit for legacy method-based detection; declare to exclude inherited stubs. */
  promptfooCapabilities?: readonly ProviderCapability[];
  /** Release long-lived resources. Request cancellation uses abortSignal instead. */
  cleanup?: () => void | Promise<void>;
}

export interface ProviderOperations {
  callApi: CallApiFunction;
  callEmbeddingApi: (
    input: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ) => Promise<ProviderEmbeddingResponse>;
  callClassificationApi: (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ) => Promise<ProviderClassificationResponse>;
  callSimilarityApi: (
    reference: string,
    input: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ) => Promise<ProviderSimilarityResponse>;
  callModerationApi: (
    prompt: string,
    response: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ) => Promise<ProviderModerationResponse>;
}

export type ProviderCapability = keyof ProviderOperations;

/** A subclass may replace a built-in stub, but its explicit capability declaration takes precedence. */
function hasSubclassCapabilityOverride(provider: object, capability: ProviderCapability): boolean {
  let prototype = Object.getPrototypeOf(provider);
  let overridden = Object.prototype.hasOwnProperty.call(provider, capability);
  while (prototype && prototype !== Object.prototype) {
    if (
      prototype.constructor &&
      Object.prototype.hasOwnProperty.call(prototype.constructor, 'declaredProviderCapabilities')
    ) {
      return (
        overridden &&
        (provider as ProviderIdentity).promptfooCapabilities ===
          prototype.constructor.declaredProviderCapabilities
      );
    }
    if (Object.prototype.hasOwnProperty.call(prototype, capability)) {
      overridden = true;
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  return false;
}

/** Check both the implementation and any explicit capability declaration. */
export function hasProviderCapability<K extends ProviderCapability>(
  provider: unknown,
  capability: K,
): provider is ProviderIdentity & Pick<ProviderOperations, K> {
  return (
    typeof provider === 'object' &&
    provider !== null &&
    'id' in provider &&
    typeof provider.id === 'function' &&
    capability in provider &&
    typeof (provider as Record<string, unknown>)[capability] === 'function' &&
    (!('promptfooCapabilities' in provider) ||
      provider.promptfooCapabilities === undefined ||
      (Array.isArray(provider.promptfooCapabilities) &&
        provider.promptfooCapabilities.includes(capability)) ||
      hasSubclassCapabilityOverride(provider, capability))
  );
}

// Keep the legacy text-provider shape and permissive default config at the public
// boundary. Internal adapters can specify TConfig and use operation guards.
export interface ApiProvider<TConfig = any> extends MinimalApiProvider, ProviderIdentity<TConfig> {
  callApi: ProviderOperations['callApi'];
  callClassificationApi?: ProviderOperations['callClassificationApi'];
  callEmbeddingApi?: ProviderOperations['callEmbeddingApi'];
  callSimilarityApi?: ProviderOperations['callSimilarityApi'];
  callModerationApi?: ProviderOperations['callModerationApi'];
  delay?: number;
  getSessionId?: () => string;
  inputs?: Inputs;
  label?: ProviderLabel;
  transform?: string | TransformFunction;
  toJSON?: () => any;
}

export interface ApiEmbeddingProvider extends ApiProvider {
  callEmbeddingApi: ProviderOperations['callEmbeddingApi'];
}

export interface ApiSimilarityProvider extends ApiProvider {
  callSimilarityApi: ProviderOperations['callSimilarityApi'];
}

export interface ApiClassificationProvider extends ApiProvider {
  callClassificationApi: ProviderOperations['callClassificationApi'];
}

export interface ApiModerationProvider extends ApiProvider {
  callModerationApi: ProviderOperations['callModerationApi'];
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

export function isApiProvider(provider: unknown): provider is ApiProvider {
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
