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
  AudioOutput,
  ChatMessage,
  GuardrailResponse,
  ImageOutput,
  ModerationFlag,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderModerationResponse,
  ProviderResponse,
  ProviderSimilarityResponse,
  VideoOutput,
} from '../contracts/providers';
export type { TokenUsage } from './shared';
export type ProviderId = string;
export type ProviderLabel = string;
/**
 * Function form accepted anywhere the Node.js API accepts a provider.
 *
 * Use a function when the provider is easiest to express inline. Use an
 * `ApiProvider` object instead when you need additional capabilities such as
 * embeddings, similarity, or classification methods.
 *
 * @example
 * ```ts
 * const provider: ProviderFunction = async (prompt) => ({
 *   output: `Echo: ${prompt}`,
 * });
 * ```
 *
 * @public
 */
export type ProviderFunction = CallApiFunction;
export type ProviderOptionsMap = Record<ProviderId, ProviderOptions>;
/**
 * Provider override accepted anywhere a single provider configuration is allowed.
 *
 * Use a string for a built-in provider id, a function for a small custom
 * provider, or an object when you need labels, env overrides, transforms, or
 * other provider options.
 *
 * @example
 * ```ts
 * const provider: ProviderConfig = {
 *   id: 'openai:chat:gpt-5.5',
 *   label: 'primary',
 * };
 * ```
 *
 * @public
 */
export type ProviderConfig =
  | ProviderId
  | ProviderFunction
  | ApiProvider
  | ProviderOptions
  | ProviderOptionsMap;
/**
 * Provider input accepted by `evaluate()` and `loadApiProviders()`.
 *
 * Pass one provider id, provider function, provider object, or an array that
 * mixes the supported provider config forms.
 *
 * @example
 * ```ts
 * const providers: ProvidersConfig = [
 *   'openai:chat:gpt-5.5',
 *   async (prompt) => ({ output: `Echo: ${prompt}` }),
 * ];
 * ```
 *
 * @public
 */
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

// Local interface to avoid circular dependency with src/types/index.ts.
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
/**
 * Declarative provider configuration accepted by provider-loading APIs.
 *
 * @example
 * ```ts
 * const provider: ProviderOptions = {
 *   id: 'openai:chat:gpt-5.5',
 *   label: 'candidate',
 *   config: { temperature: 0.2 },
 *   inputs: {
 *     resume: {
 *       description: 'Resume PDF to summarize',
 *       type: 'pdf',
 *     },
 *   },
 * };
 * ```
 *
 * @public
 */
export interface ProviderOptions {
  /** Provider id to instantiate, such as `openai:chat:gpt-5.5`. */
  id?: ProviderId;
  /** Human-readable label used in reports and provider maps. */
  label?: ProviderLabel;
  /**
   * Provider-specific configuration passed to the provider factory. Each
   * built-in provider documents its own config shape; for custom providers
   * this is whatever the provider implementation expects. Typed as `any`
   * because the resolved shape is provider-specific and is narrowed inside
   * the provider implementation.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any;
  /** Restrict this provider to named prompts. */
  prompts?: string[];
  /** Transform provider output before assertions run. */
  transform?: string | TransformFunction;
  /** Delay in milliseconds before provider calls. */
  delay?: number;
  /** Environment overrides available while loading and calling the provider. */
  env?: EnvOverrides;
  /**
   * Declared named inputs accepted by the provider.
   *
   * Each key is the variable name. Use a short description string for simple
   * text inputs, or an object when the input needs a declared media type or
   * generation guidance.
   */
  inputs?: Inputs;
}

/**
 * Runtime context passed to custom provider functions.
 *
 * @example
 * ```ts
 * const provider: ProviderFunction = async (prompt, context) => ({
 *   output: `${context?.vars.user}: ${prompt}`,
 *   metadata: { evaluationId: context?.evaluationId },
 * });
 * ```
 *
 * @public
 */
export interface CallApiContextParams {
  /** Nunjucks filters available while rendering related prompt content. */
  filters?: NunjucksFilterMap;
  /**
   * Accessor for the active cache instance. Treat the return value as opaque
   * and prefer the documented `cache.*` helpers from the package over calling
   * it directly.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getCache?: () => any;
  /** Logger configured for the current eval. */
  logger?: winston.Logger;
  /** Original provider when this call is being graded or wrapped. */
  originalProvider?: ApiProvider;
  /** Prompt object for the current provider call. */
  prompt: Prompt;
  /** Rendered variables for the current test case. */
  vars: Record<string, VarValue>;
  /** Whether the caller requested debug behavior. */
  debug?: boolean;
  /** Test case currently being executed, when available to the caller. */
  test?: AtomicTestCase;
  /** Whether this call should bypass reusable response cache entries. */
  bustCache?: boolean;

  /** W3C Trace Context `traceparent` header for downstream propagation. */
  traceparent?: string;
  /** W3C Trace Context `tracestate` header for downstream propagation. */
  tracestate?: string;

  /** Eval identifier for manual correlation across provider calls. */
  evaluationId?: string;
  /** Stable id for the current test case when one has been assigned. */
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
  /** Zero-based repeat index when the same test case is executed repeatedly. */
  repeatIndex?: number;
}

/**
 * Per-request options passed to custom providers.
 *
 * These are execution controls for one call, not provider configuration. Read
 * them inside `callApi()` when the transport can honor cancellation or optional
 * log-prob requests.
 *
 * @example
 * ```ts
 * const provider: ProviderFunction = async (prompt, _context, options) => {
 *   const response = await fetch('https://example.com/llm', {
 *     method: 'POST',
 *     body: prompt,
 *     signal: options?.abortSignal,
 *   });
 *   return { output: await response.text() };
 * };
 * ```
 *
 * @public
 */
export interface CallApiOptionsParams {
  /** Whether the caller requested token log probabilities when supported. */
  includeLogProbs?: boolean;
  /** Signal that can be used to abort the request. */
  abortSignal?: AbortSignal;
}

/**
 * Provider object shape accepted by the Node.js API.
 *
 * Start with `ProviderFunction` for a simple text-only integration. Implement
 * `ApiProvider` when the provider needs a stable id, lifecycle hooks, or extra
 * methods for embeddings, similarity, classification, or moderation.
 *
 * @example
 * ```ts
 * const provider: ApiProvider = {
 *   id: () => 'custom:echo',
 *   label: 'echo',
 *   callApi: async (prompt) => ({ output: `Echo: ${prompt}` }),
 * };
 * ```
 *
 * @public
 */
export interface ApiProvider extends MinimalApiProvider {
  /** Execute one provider request. */
  callApi: CallApiFunction;
  /**
   * Optional classification-specific entrypoint for compatible providers.
   *
   * @param prompt - Text to classify.
   * @returns Class labels mapped to provider-reported scores.
   */
  callClassificationApi?(prompt: string): Promise<ProviderClassificationResponse>;
  /**
   * Optional embedding-specific entrypoint for compatible providers.
   *
   * @param input - Text to embed.
   * @returns Embedding vector plus any provider-reported metadata.
   */
  callEmbeddingApi?(input: string): Promise<ProviderEmbeddingResponse>;
  /**
   * Provider-specific configuration retained for later calls and serialization.
   * The shape mirrors {@link ProviderOptions.config}; consult the documentation
   * for the specific provider for the supported keys.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any;
  /** Delay in milliseconds before provider calls. */
  delay?: number;
  /** Optional stable session id for conversational providers. */
  getSessionId?: () => string;
  /**
   * Named provider inputs used by multi-input targets.
   *
   * Each key is the variable name. Use a short description string for simple
   * text inputs, or an object when the input needs a declared media type or
   * generation guidance.
   */
  inputs?: Inputs;
  /** Human-readable label shown in reports. */
  label?: ProviderLabel;
  /** Transform provider output before assertions run. */
  transform?: string | TransformFunction;
  /**
   * Custom JSON serialization hook used when persisting the provider on an eval
   * record. Implementations should return a value that is structurally
   * serializable (no functions or circular references).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Function signature used by custom providers.
 *
 * Return a `ProviderResponse` with at least `output` or `error`. The optional
 * `context` argument exposes the rendered prompt, variables, logger, and eval
 * metadata for the current call. Use `options.abortSignal` for request-scoped
 * cancellation when your provider supports it.
 *
 * @example
 * ```ts
 * const echoProvider: CallApiFunction = async (prompt, context) => ({
 *   output: `Echo: ${prompt}`,
 *   metadata: { user: context?.vars.user },
 * });
 * ```
 *
 * @param prompt - Rendered prompt text for the current provider call.
 * @param context - Runtime metadata for the current eval row, when available.
 * @param options - Per-request execution options such as cancellation.
 *
 * @public
 */
export interface CallApiFunction {
  (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse>;
  /** Human-readable label used when the provider function is shown in reports. */
  label?: string;
}

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
