import { createHash, randomUUID } from 'crypto';

import Anthropic from '@anthropic-ai/sdk';
import { getEnvString } from '../../envars';
import { getEnvOverrides } from '../../envOverrides';
import logger from '../../logger';
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

/**
 * Parse ANTHROPIC_CUSTOM_HEADERS the same way the Anthropic SDK does
 * (newline-separated `Name: value` lines) and map each header name to null so
 * the SDK omits it. Providers that reuse the SDK against Anthropic-compatible
 * third-party endpoints use this to keep Anthropic-scoped headers (often
 * gateway/proxy secrets) off foreign hosts.
 */
export function getAnthropicEnvHeaderSuppressions(env?: EnvOverrides): Record<string, null> {
  const scopedHeaders =
    env?.ANTHROPIC_CUSTOM_HEADERS ?? getEnvOverrides()?.ANTHROPIC_CUSTOM_HEADERS;
  return Object.fromEntries(
    Object.keys({
      ...parseAnthropicCustomHeaders(process.env.ANTHROPIC_CUSTOM_HEADERS),
      ...parseAnthropicCustomHeaders(scopedHeaders),
    }).map((name) => [name, null]),
  );
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
  const customHeaders =
    env?.ANTHROPIC_CUSTOM_HEADERS ?? getEnvOverrides()?.ANTHROPIC_CUSTOM_HEADERS;
  if (customHeaders === undefined) {
    return {};
  }

  return {
    ...getAnthropicEnvHeaderSuppressions(env),
    ...parseAnthropicCustomHeaders(customHeaders),
  };
}

/**
 * Base options shared by all Anthropic provider implementations.
 */
interface AnthropicBaseOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  /**
   * When `false`, skip the upfront API key check and fall back to
   * authenticating through a local Claude Code session (OAuth token sourced
   * from the macOS keychain or `$HOME/.claude/.credentials.json`).
   *
   * Matches the `apiKeyRequired` option already exposed by the
   * `anthropic:claude-agent-sdk` provider.
   *
   * @default true
   */
  apiKeyRequired?: boolean;
  headers?: Record<string, string>;
  cost?: number;
  inputCost?: number;
  outputCost?: number;
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
      this.env?.ANTHROPIC_CUSTOM_HEADERS ??
      getEnvOverrides()?.ANTHROPIC_CUSTOM_HEADERS ??
      process.env.ANTHROPIC_CUSTOM_HEADERS;
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
    const scopedCustomHeaderValue =
      this.env?.ANTHROPIC_CUSTOM_HEADERS ?? getEnvOverrides()?.ANTHROPIC_CUSTOM_HEADERS;
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

    this.anthropic = new Anthropic(
      this.buildAnthropicClientOptions({
        apiKey: this.apiKey ?? null,
        authToken: authToken ?? null,
        baseURL: this.getApiBaseUrl(),
        ...(Object.keys(clientDefaultHeaders).length > 0
          ? { defaultHeaders: clientDefaultHeaders }
          : {}),
      }),
    );
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
    return this.config?.apiKey || this.env?.ANTHROPIC_API_KEY || getEnvString('ANTHROPIC_API_KEY');
  }

  getApiBaseUrl(): string | undefined {
    return (
      this.config?.apiBaseUrl || this.env?.ANTHROPIC_BASE_URL || getEnvString('ANTHROPIC_BASE_URL')
    );
  }

  protected getCacheIdentityHash(): string {
    return hashAnthropicCacheValue({
      apiBaseUrl: this.getApiBaseUrl(),
    });
  }

  protected hasCustomHeaders(): boolean {
    const customHeaders =
      this.env?.ANTHROPIC_CUSTOM_HEADERS ??
      getEnvOverrides()?.ANTHROPIC_CUSTOM_HEADERS ??
      process.env.ANTHROPIC_CUSTOM_HEADERS;
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
