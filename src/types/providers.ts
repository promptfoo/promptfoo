import type winston from 'winston';

import type { EnvOverrides } from './env';
import type { Prompt } from './prompts';
import type { NunjucksFilterMap, TokenUsage } from './shared';

export type { TokenUsage } from './shared';
export type ProviderId = string;
export type ProviderLabel = string;
export type ProviderFunction = ApiProvider['callApi'];
export type ProviderOptionsMap = Record<ProviderId, ProviderOptions>;

export type ProviderType = 'embedding' | 'classification' | 'text' | 'moderation';

export type ProviderTypeMap = Partial<Record<ProviderType, string | ProviderOptions | ApiProvider>>;

// Local interface to avoid circular dependency with src/types/index.ts
interface AtomicTestCase {
  description?: string;
  vars?: Record<string, string | object>;
  providerResponse?: ProviderResponse;
  tokenUsage?: TokenUsage;
  success?: boolean;
  score?: number;
  failureReason?: string;
  metadata?: Record<string, any>;
}
export interface ProviderModerationResponse {
  error?: string;
  flags?: ModerationFlag[];
}

export interface ModerationFlag {
  code: string;
  description: string;
  confidence: number;
}

export interface ProviderOptions {
  id?: ProviderId;
  label?: ProviderLabel;
  config?: any;
  prompts?: string[];
  transform?: string;
  delay?: number;
  env?: EnvOverrides;
}

/**
 * Context passed to a provider's startSession method.
 * Provides information about the conversation/session being started.
 */
export interface SessionContext {
  /**
   * Unique identifier for this conversation.
   * Multiple tests can share the same conversationId to maintain session continuity.
   */
  conversationId?: string;
  /**
   * The test case being executed, including metadata.
   */
  test?: AtomicTestCase;
  /**
   * Initial variables for the session.
   */
  vars?: Record<string, string | object>;
}

/**
 * Response from a provider's startSession method.
 * Contains the session ID that will be used for subsequent API calls.
 */
export interface SessionResponse {
  /**
   * Unique session identifier returned by the provider.
   * This will be passed in the context of subsequent callApi calls.
   */
  sessionId: string;
  /**
   * Optional metadata about the session.
   */
  metadata?: Record<string, any>;
}

export interface CallApiContextParams {
  filters?: NunjucksFilterMap;
  getCache?: any;
  logger?: winston.Logger;
  originalProvider?: ApiProvider;
  prompt: Prompt;
  vars: Record<string, string | object>;
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
   * Session ID for conversational providers that maintain state across multiple calls.
   * Set by the evaluator when a provider implements startSession.
   */
  sessionId?: string;
}

export interface CallApiOptionsParams {
  includeLogProbs?: boolean;
  /**
   * Signal that can be used to abort the request
   */
  abortSignal?: AbortSignal;
}

export interface ApiProvider {
  id: () => string;
  callApi: CallApiFunction;
  callClassificationApi?: (prompt: string) => Promise<ProviderClassificationResponse>;
  callEmbeddingApi?: (input: string) => Promise<ProviderEmbeddingResponse>;
  config?: any;
  delay?: number;
  getSessionId?: () => string;
  label?: ProviderLabel;
  transform?: string;
  toJSON?: () => any;
  /**
   * Cleanup method called when a provider call is aborted (e.g., due to timeout)
   * Providers should implement this to clean up any resources they might have
   * allocated, such as file handles, network connections, etc.
   */
  cleanup?: () => void | Promise<void>;

  /**
   * Called once when a new conversation/session begins.
   * For conversational AI providers that need to maintain server-side session state.
   * Returns a session ID that will be passed to subsequent callApi calls via context.sessionId.
   *
   * @param context - Information about the conversation being started
   * @returns Session information including the sessionId to use for subsequent calls
   *
   * @example
   * ```typescript
   * async startSession(context: SessionContext): Promise<SessionResponse> {
   *   const response = await fetch(`${this.baseUrl}/startSession`, {
   *     method: 'POST',
   *     body: JSON.stringify({ conversationId: context.conversationId })
   *   });
   *   const data = await response.json();
   *   return { sessionId: data.sessionId };
   * }
   * ```
   */
  startSession?: (context: SessionContext) => Promise<SessionResponse>;

  /**
   * Called after all messages in a session are complete.
   * Allows the provider to clean up server-side session state.
   *
   * @param sessionId - The session ID returned from startSession
   *
   * @example
   * ```typescript
   * async closeSession(sessionId: string): Promise<void> {
   *   await fetch(`${this.baseUrl}/closeSession`, {
   *     method: 'POST',
   *     body: JSON.stringify({ sessionId })
   *   });
   * }
   * ```
   */
  closeSession?: (sessionId: string) => Promise<void>;
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

export interface GuardrailResponse {
  flaggedInput?: boolean;
  flaggedOutput?: boolean;
  flagged?: boolean;
  reason?: string;
}

export interface ProviderResponse {
  cached?: boolean;
  cost?: number;
  error?: string;
  logProbs?: number[];
  metadata?: {
    redteamFinalPrompt?: string;
    http?: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
    };
    [key: string]: any;
  };
  raw?: string | any;
  output?: string | any;
  /**
   * Output after provider-level transform. Used by contextTransform to ensure
   * it operates on provider-normalized output, independent of test transforms.
   */
  providerTransformedOutput?: string | any;
  tokenUsage?: TokenUsage;
  isRefusal?: boolean;
  sessionId?: string;
  guardrails?: GuardrailResponse;
  finishReason?: string;
  audio?: {
    id?: string;
    expiresAt?: number;
    data?: string; // base64 encoded audio data
    transcript?: string;
    format?: string;
  };
}

export interface ProviderEmbeddingResponse {
  cost?: number;
  error?: string;
  embedding?: number[];
  tokenUsage?: Partial<TokenUsage>;
  metadata?: {
    transformed?: boolean;
    originalText?: string;
    [key: string]: any;
  };
}

export interface ProviderSimilarityResponse {
  error?: string;
  similarity?: number;
  tokenUsage?: Partial<TokenUsage>;
}

export interface ProviderClassificationResponse {
  error?: string;
  classification?: Record<string, number>;
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
    typeof provider.id === 'function'
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
}
