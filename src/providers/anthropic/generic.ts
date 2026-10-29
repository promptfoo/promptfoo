import { createHash, randomUUID } from 'crypto';

import Anthropic from '@anthropic-ai/sdk';
import { context as otelContext, propagation } from '@opentelemetry/api';
import { type EnvVarKey, getEnvOverrides, getEnvString, getProviderEnvString } from '../../envars';
import { getExplicitProviderEnv } from '../../envOverrides';
import logger from '../../logger';
import { resolveProviderApiKey } from '../credentials';
import {
  CLAUDE_CODE_OAUTH_BETA_FEATURES,
  CLAUDE_CODE_USER_AGENT,
  CLAUDE_CODE_X_APP,
  isCredentialExpired,
  loadClaudeCodeCredential,
} from './claudeCodeAuth';
import type { ClientOptions } from '@anthropic-ai/sdk';
import type { Cache } from 'cache-manager';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/index';
import type { ClaudeCodeOAuthCredential } from './claudeCodeAuth';
import type { AnthropicBaseOptions, AnthropicOpenTelemetryOptions } from './types';

function getScopedCustomHeaders(env?: EnvOverrides): string | undefined {
  return (
    getExplicitProviderEnv(env)?.ANTHROPIC_CUSTOM_HEADERS ??
    getEnvOverrides('provider')?.ANTHROPIC_CUSTOM_HEADERS ??
    env?.ANTHROPIC_CUSTOM_HEADERS ??
    getEnvOverrides()?.ANTHROPIC_CUSTOM_HEADERS ??
    getEnvOverrides('file')?.ANTHROPIC_CUSTOM_HEADERS
  );
}

/**
 * Parse ANTHROPIC_CUSTOM_HEADERS the same way the Anthropic SDK does
 * (newline-separated `Name: value` lines) and map each header name to null so
 * the SDK omits it. Providers that reuse the SDK against Anthropic-compatible
 * third-party endpoints use this to keep Anthropic-scoped headers (often
 * gateway/proxy secrets) off foreign hosts.
 */
export function getAnthropicEnvHeaderSuppressions(env?: EnvOverrides): Record<string, null> {
  const scopedHeaders = getScopedCustomHeaders(env);
  return Object.fromEntries(
    Object.keys({
      ...parseAnthropicCustomHeaders(process.env.ANTHROPIC_CUSTOM_HEADERS),
      ...parseAnthropicCustomHeaders(scopedHeaders),
    }).map((name) => [name, null]),
  );
}

/**
 * Client options for an Anthropic-compatible endpoint that is *not* Anthropic
 * (Bedrock's mantle host, a Cloudflare AI Gateway).
 *
 * `ANTHROPIC_CUSTOM_HEADERS` is scoped to api.anthropic.com, so anything it
 * defines — an Authorization bearer, a proxy secret, an Anthropic `x-api-key` —
 * must never ride along to a third-party host. Drop every name it defines, in
 * every case variant (HTTP header names are case-insensitive, so `X-Api-Key`
 * and `x-api-key` are the same header and both have to go), then re-assert this
 * provider's own credential.
 */
export function buildIsolatedAnthropicClientOptions(
  options: ClientOptions,
  env: EnvOverrides | undefined,
  apiKey: string | undefined,
): ClientOptions {
  const suppressedEnvHeaders = getAnthropicEnvHeaderSuppressions(env);
  const suppressedNames = new Set(
    Object.keys(suppressedEnvHeaders).map((name) => name.toLowerCase()),
  );
  const safeDefaultHeaders = Object.fromEntries(
    Object.entries(options.defaultHeaders ?? {}).filter(
      ([name]) => !suppressedNames.has(name.toLowerCase()),
    ),
  );
  // Re-assert the provider's key under every x-api-key spelling the env
  // suppressed, so a suppression cannot leave the request unauthenticated.
  const apiKeyHeaders = Object.fromEntries(
    Object.keys(suppressedEnvHeaders)
      .filter((name) => name.toLowerCase() === 'x-api-key')
      .map((name) => [name, apiKey]),
  );

  return {
    ...options,
    defaultHeaders: {
      ...safeDefaultHeaders,
      ...suppressedEnvHeaders,
      ...(apiKey ? { 'x-api-key': apiKey, ...apiKeyHeaders } : {}),
    },
  };
}

function parseAnthropicCustomHeaders(value: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of value?.split('\n') ?? []) {
    const colon = line.indexOf(':');
    if (colon >= 0) {
      const name = line.substring(0, colon).trim();
      if (name) {
        headers[name] = line.substring(colon + 1).trim();
      }
    }
  }
  return headers;
}

/** The W3C trace context headers, which the Claude API reads. */
export const TRACE_CONTEXT_HEADERS = new Set(['traceparent', 'tracestate']);

function hasHeader(headers: Record<string, unknown> | undefined, names: Set<string>): boolean {
  return Object.keys(headers ?? {}).some((name) => names.has(name.toLowerCase()));
}

/**
 * Whether the client's default headers carry W3C trace context, merged as the SDK merges them: the
 * process's `ANTHROPIC_CUSTOM_HEADERS` first, then `defaultHeaders`, where `null` drops a header.
 */
function defaultHeadersSetTraceContext(defaultHeaders: ClientOptions['defaultHeaders']): boolean {
  const names = new Set<string>();
  for (const [name, value] of Object.entries({
    ...parseAnthropicCustomHeaders(process.env.ANTHROPIC_CUSTOM_HEADERS),
    ...(defaultHeaders as Record<string, string | null | undefined> | undefined),
  })) {
    if (value === null) {
      names.delete(name.toLowerCase());
    } else if (typeof value === 'string') {
      names.add(name.toLowerCase());
    }
  }
  return [...TRACE_CONTEXT_HEADERS].some((name) => names.has(name));
}

/** A config value as `true`, `false`, an options object, or unset; templated booleans are strings. */
function normalizeOpenTelemetryOption(
  option: unknown,
): boolean | AnthropicOpenTelemetryOptions | undefined {
  if (typeof option === 'string') {
    const value = option.trim().toLowerCase();
    return value === 'true' ? true : value === 'false' ? false : undefined;
  }
  if (typeof option === 'boolean') {
    return option;
  }
  return typeof option === 'object' && option !== null && !Array.isArray(option)
    ? (option as AnthropicOpenTelemetryOptions)
    : undefined;
}

/**
 * The SDK's `openTelemetry` client option for a provider's `openTelemetry` config, and whether
 * promptfoo sends trace context itself. Promptfoo records its own span for every call, so the
 * SDK's spans, which would repeat it, stay off unless the config asks for them. The SDK sends
 * trace context only from spans of its own, so promptfoo sends its span's while the SDK's are
 * off. The SDK's `ANTHROPIC_OPEN_TELEMETRY*` variables are read through promptfoo's environment
 * layers, like other provider settings, and `ANTHROPIC_OPEN_TELEMETRY_PROPAGATION=false` stops
 * trace context unless an options object sets `propagation`.
 */
function resolveOpenTelemetry(
  option: unknown,
  env: EnvOverrides | undefined,
  configuresTraceContext: boolean,
): {
  client: ClientOptions['openTelemetry'];
  propagatesTraceContext: boolean;
  sdkPropagatesTraceContext: boolean;
} {
  const read = (key: EnvVarKey) =>
    (getProviderEnvString(env, key) ?? getEnvString(key))?.trim().toLowerCase();
  const propagation = read('ANTHROPIC_OPEN_TELEMETRY_PROPAGATION') !== 'false';
  const value = normalizeOpenTelemetryOption(option);
  if (value === undefined || value === false) {
    return {
      client: false,
      propagatesTraceContext: value === undefined && propagation && !configuresTraceContext,
      sdkPropagatesTraceContext: false,
    };
  }

  let client: Exclude<ClientOptions['openTelemetry'], false | undefined>;
  if (value === true) {
    const maxContentBytes = read('ANTHROPIC_OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES');
    client = {
      propagation,
      traces: {
        enabled: read('ANTHROPIC_OPEN_TELEMETRY') !== 'false',
        contentMode:
          read('ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE') === 'content'
            ? 'content'
            : 'metadata_only',
        ...(maxContentBytes && /^\d+$/.test(maxContentBytes)
          ? { maxContentBytes: Number(maxContentBytes) }
          : {}),
      },
    };
  } else {
    client = { ...value, propagation: value.propagation ?? propagation };
  }
  const { traces } = client;
  const spans = traces !== false && (typeof traces !== 'object' || traces.enabled !== false);
  // The SDK replaces trace context headers with its own span's; the config's win, as they do
  // when promptfoo sends trace context, and the SDK still records its spans.
  if (spans && configuresTraceContext) {
    client = { ...client, propagation: false };
  }
  return {
    client,
    propagatesTraceContext: !spans && client.propagation !== false && !configuresTraceContext,
    sdkPropagatesTraceContext: spans && client.propagation !== false,
  };
}

function setCaseInsensitiveHeaderValue(
  headers: Record<string, string | null>,
  headerName: string,
  value: string,
): void {
  headers[headerName] = value;
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === headerName.toLowerCase()) {
      headers[name] = value;
    }
  }
}

function getAnthropicCustomHeaderOverrides(
  env: EnvOverrides | undefined,
): Record<string, string | null> {
  const customHeaders = getScopedCustomHeaders(env);
  if (customHeaders === undefined) {
    return {};
  }

  return {
    ...getAnthropicEnvHeaderSuppressions(env),
    ...parseAnthropicCustomHeaders(customHeaders),
  };
}

const ANTHROPIC_CACHE_HASH_CONTEXT = 'promptfoo:anthropic:cache-key:v1';
const MAX_EPHEMERAL_RESPONSE_CACHE_ENTRIES = 512;

// Canonicalize before hashing so semantically identical plain objects with
// different property insertion orders produce the same cache key. See
// `src/providers/AGENTS.md` "Cache Key Hygiene". Class instances such as
// `Date` or `Buffer` are passed through so their `toJSON` / default
// serialization is preserved — rebuilding them via `Object.keys` would
// collapse distinct values to the same shape and cause cache collisions.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((k) => [k, canonicalize(value[k])] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

export function hashAnthropicCacheValue(value: unknown): string {
  const canonical = canonicalize(value);
  const serialized =
    typeof canonical === 'string' ? canonical : (JSON.stringify(canonical) ?? String(canonical));
  return createHash('sha256')
    .update(ANTHROPIC_CACHE_HASH_CONTEXT)
    .update('\0')
    .update(serialized)
    .digest('hex');
}

/**
 * Generic provider class for Anthropic APIs.
 *
 * Serves as a base class with shared functionality for all Anthropic
 * subclass providers. Handles API key resolution and, for subclasses that
 * opt in via {@link AnthropicGenericProvider.SUPPORTS_CLAUDE_CODE_OAUTH},
 * falls back to an OAuth token loaded from a local Claude Code session so
 * Claude.ai subscribers can run evals without a separate console API key.
 *
 * The OAuth fallback is opt-in so it only affects
 * `AnthropicMessagesProvider`. Claude Code OAuth tokens are gated to the
 * Messages API (`/v1/messages`) — forwarding them to the legacy
 * text-completion endpoint would fail at request time, which would cause
 * `anthropic:completion:*` configs to bypass promptfoo's upfront preflight
 * check and then produce a less useful error for every test case.
 */
export class AnthropicGenericProvider implements ApiProvider {
  /**
   * Subclasses that can authenticate via a Claude Code OAuth session
   * should override this to `true`. The base class's constructor reads the
   * flag from `this.constructor` so only OAuth-capable subclasses attempt
   * the credential lookup (and only they honor `apiKeyRequired: false`).
   */
  static readonly SUPPORTS_CLAUDE_CODE_OAUTH: boolean = false;

  modelName: string;
  config: AnthropicBaseOptions;
  env?: EnvOverrides;
  apiKey?: string;
  /**
   * `true` when this provider is authenticating via a Claude Code OAuth token
   * rather than a standard `ANTHROPIC_API_KEY`. Subclasses use this to inject
   * the Claude Code identity system block that Anthropic's API requires for
   * OAuth-authenticated Messages requests.
   */
  usingClaudeCodeOAuth: boolean;
  /**
   * The Claude Code credential used to authenticate, when
   * `usingClaudeCodeOAuth` is `true`. Kept so subclasses can re-check expiry
   * at request time and surface a "run `claude /login`" error instead of a
   * raw 401 from the SDK.
   */
  claudeCodeCredential?: ClaudeCodeOAuthCredential;
  anthropic: Anthropic;
  label?: string;
  /** Whether requests of a traced call carry promptfoo's span context (see `openTelemetry`). */
  protected readonly propagatesTraceContext: boolean;
  /** Whether the SDK sends its own span's trace context (see `withoutApplicationBaggage`). */
  private readonly sdkPropagatesTraceContext: boolean;
  private readonly clientHasCustomHeaders: boolean;
  private readonly ephemeralCacheNamespace = randomUUID();
  private readonly ephemeralResponseCache = new Map<
    string,
    { response: string; expiresAt: number }
  >();
  private ephemeralCacheClearGeneration = 0;

  constructor(
    modelName: string,
    options: {
      config?: AnthropicBaseOptions;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config, id, label, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.label = label;
    const customHeaders =
      getScopedCustomHeaders(this.env) ?? getEnvString('ANTHROPIC_CUSTOM_HEADERS');
    this.clientHasCustomHeaders =
      Object.keys(this.config.headers ?? {}).length > 0 ||
      Object.keys(parseAnthropicCustomHeaders(customHeaders)).length > 0;
    this.apiKey = this.getApiKey();
    this.usingClaudeCodeOAuth = false;

    let authToken: string | undefined;
    const defaultHeaders: Record<string, string> = {};

    const subclass = this.constructor as typeof AnthropicGenericProvider;
    if (
      !this.apiKey &&
      this.config.apiKeyRequired === false &&
      subclass.SUPPORTS_CLAUDE_CODE_OAUTH
    ) {
      const credential = loadClaudeCodeCredential(this.env);
      if (credential) {
        if (isCredentialExpired(credential)) {
          logger.warn(
            '[anthropic] Claude Code OAuth credential is expired. Run `claude /login` to refresh it.',
          );
        } else {
          logger.debug(
            '[anthropic] Authenticating with Claude Code OAuth credential from local session.',
          );
        }
        authToken = credential.accessToken;
        this.usingClaudeCodeOAuth = true;
        this.claudeCodeCredential = credential;
        defaultHeaders['anthropic-beta'] = CLAUDE_CODE_OAUTH_BETA_FEATURES.join(',');
        // Mimic the Claude Code CLI user-agent / x-app headers so the OAuth
        // token is accepted. As of 2025-Q4 Anthropic gates OAuth tokens to
        // the Claude Code app identity; without these headers requests fail
        // with 401 `authentication_error`. These are also re-applied as
        // per-request headers in `messages.ts` so `config.headers` cannot
        // silently clobber them.
        defaultHeaders['user-agent'] = CLAUDE_CODE_USER_AGENT;
        defaultHeaders['x-app'] = CLAUDE_CODE_X_APP;
      } else {
        logger.warn(
          '[anthropic] apiKeyRequired is false but no Claude Code credential was found. ' +
            'Run `claude /login` to create one, or set ANTHROPIC_API_KEY.',
        );
      }
    }

    const clientDefaultHeaders = {
      ...getAnthropicCustomHeaderOverrides(this.env),
      ...defaultHeaders,
    };
    const scopedCustomHeaderValue = getScopedCustomHeaders(this.env);
    const scopedCustomHeaders = parseAnthropicCustomHeaders(scopedCustomHeaderValue);
    const scopedAuthHeaders = new Set(
      Object.keys(scopedCustomHeaders).map((name) => name.toLowerCase()),
    );
    if (
      scopedCustomHeaderValue !== undefined &&
      this.apiKey &&
      !scopedAuthHeaders.has('x-api-key')
    ) {
      setCaseInsensitiveHeaderValue(clientDefaultHeaders, 'x-api-key', this.apiKey);
    }
    if (
      scopedCustomHeaderValue !== undefined &&
      authToken &&
      !scopedAuthHeaders.has('authorization')
    ) {
      setCaseInsensitiveHeaderValue(clientDefaultHeaders, 'authorization', `Bearer ${authToken}`);
    }

    const clientOptions = this.buildAnthropicClientOptions({
      apiKey: this.apiKey ?? null,
      authToken: authToken ?? null,
      baseURL: this.getApiBaseUrl(),
      ...(Object.keys(clientDefaultHeaders).length > 0
        ? { defaultHeaders: clientDefaultHeaders }
        : {}),
    });
    // Trace context that the config sets, in `headers` or in custom headers that reach this host
    // (read after a subclass isolates them), is sent as set.
    const openTelemetry = resolveOpenTelemetry(
      this.config.openTelemetry,
      this.env,
      hasHeader(this.config.headers, TRACE_CONTEXT_HEADERS) ||
        defaultHeadersSetTraceContext(clientOptions.defaultHeaders),
    );
    this.propagatesTraceContext = openTelemetry.propagatesTraceContext;
    this.sdkPropagatesTraceContext = openTelemetry.sdkPropagatesTraceContext;
    this.anthropic = new Anthropic({ ...clientOptions, openTelemetry: openTelemetry.client });
    this.id = id ? () => id : this.id;
  }

  /**
   * Options for the Anthropic SDK client built during construction.
   * Subclasses that point the SDK at an Anthropic-compatible third-party
   * endpoint can override this to adjust auth or headers (e.g. bearer-token
   * services). Called from the constructor, so overrides may only rely on
   * `config`, `env`, and `apiKey`, which are set before the client is built.
   */
  protected buildAnthropicClientOptions(options: ClientOptions): ClientOptions {
    return options;
  }

  /**
   * Runs SDK calls without the application's baggage while the SDK sends trace context: it writes
   * it with the application's registered propagator, which would also send the application's
   * baggage, and the Claude API reads only W3C trace context. Headers that the config sets,
   * `baggage` included, go out as configured.
   */
  protected withoutApplicationBaggage<T>(call: () => T): T {
    return this.sdkPropagatesTraceContext
      ? otelContext.with(propagation.deleteBaggage(otelContext.active()), call)
      : call();
  }

  id(): string {
    return `anthropic:${this.modelName}`;
  }

  toString(): string {
    return `[Anthropic Provider ${this.modelName}]`;
  }

  /**
   * Whether promptfoo's preflight check should require an API key before
   * dispatching requests to this provider. Returns `false` only for
   * OAuth-capable subclasses (see {@link SUPPORTS_CLAUDE_CODE_OAUTH}) when
   * the user has opted in via `apiKeyRequired: false`. All other subclasses
   * keep the preflight check so missing-credential errors surface upfront
   * rather than at per-request call time.
   */
  requiresApiKey(): boolean {
    const subclass = this.constructor as typeof AnthropicGenericProvider;
    if (subclass.SUPPORTS_CLAUDE_CODE_OAUTH && this.config.apiKeyRequired === false) {
      return false;
    }
    return true;
  }

  getApiKey(): string | undefined {
    return resolveProviderApiKey(this.config, this.env, ['ANTHROPIC_API_KEY']);
  }

  getApiBaseUrl(): string | undefined {
    const envUrl =
      getProviderEnvString(this.env, 'ANTHROPIC_BASE_URL') ?? getEnvString('ANTHROPIC_BASE_URL');
    return this.config?.apiBaseUrl || (envUrl === '' ? 'https://api.anthropic.com' : envUrl);
  }

  protected getCacheIdentityHash(): string {
    return hashAnthropicCacheValue({
      apiBaseUrl: this.getApiBaseUrl(),
    });
  }

  protected hasCustomHeaders(): boolean {
    const customHeaders =
      getScopedCustomHeaders(this.env) ?? getEnvString('ANTHROPIC_CUSTOM_HEADERS');
    return (
      this.clientHasCustomHeaders ||
      Object.keys(parseAnthropicCustomHeaders(customHeaders)).length > 0
    );
  }

  protected getCacheNamespace(): string {
    // Provider aliases are stable, non-secret tenant namespaces. Credentials
    // must never contribute a persistent cache fingerprint. An unlabeled
    // provider can safely reuse responses only within its own process lifetime.
    return hashAnthropicCacheValue({
      providerId: this.id(),
      providerLabel: this.label || this.ephemeralCacheNamespace,
    });
  }

  protected async getCachedResponse(
    cache: Cache,
    cacheKey: string,
    ephemeralCacheKey: string,
    clearGeneration: number,
  ): Promise<string | undefined> {
    if (this.label) {
      return cache.get<string | undefined>(cacheKey);
    }

    this.syncEphemeralCache(clearGeneration);
    const entry = this.ephemeralResponseCache.get(ephemeralCacheKey);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.ephemeralResponseCache.delete(ephemeralCacheKey);
      return undefined;
    }
    return entry.response;
  }

  protected async setCachedResponse(
    cache: Cache,
    cacheKey: string,
    ephemeralCacheKey: string,
    clearGeneration: number,
    ttlMs: number,
    response: string,
  ): Promise<void> {
    if (this.label) {
      await cache.set(cacheKey, response);
      return;
    }

    this.syncEphemeralCache(clearGeneration);

    if (
      !this.ephemeralResponseCache.has(ephemeralCacheKey) &&
      this.ephemeralResponseCache.size >= MAX_EPHEMERAL_RESPONSE_CACHE_ENTRIES
    ) {
      const oldestKey = this.ephemeralResponseCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.ephemeralResponseCache.delete(oldestKey);
      }
    }
    this.ephemeralResponseCache.set(ephemeralCacheKey, {
      response,
      expiresAt: ttlMs <= 0 ? Number.POSITIVE_INFINITY : Date.now() + ttlMs,
    });
  }

  private syncEphemeralCache(clearGeneration: number): void {
    if (this.ephemeralCacheClearGeneration !== clearGeneration) {
      this.ephemeralResponseCache.clear();
      this.ephemeralCacheClearGeneration = clearGeneration;
    }
  }

  /**
   * Base implementation - should be overridden by specific provider implementations
   */
  async callApi(_prompt: string, _context?: CallApiContextParams): Promise<ProviderResponse> {
    throw new Error('Not implemented: callApi must be implemented by subclasses');
  }
}
