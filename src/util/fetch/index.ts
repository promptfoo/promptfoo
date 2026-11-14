import * as fsPromises from 'node:fs/promises';
import path from 'path';
import type { ConnectionOptions } from 'tls';

import { getProxyForUrl } from 'proxy-from-env';
import { Agent, type Dispatcher, ProxyAgent } from 'undici';
import cliState from '../../cliState';
import { DEFAULT_MAX_CONCURRENCY, VERSION } from '../../constants';
import { getEnvBool, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { getRequestTimeoutMs } from '../../providers/shared';
import { parseRateLimitHeaders } from '../../scheduler/headerParser';
import invariant from '../../util/invariant';
import { sleep } from '../../util/time';
import { sha256 } from '../createHash';
import { assertUrlResolvesPublic, PrivateRangeBlockedError } from '../privateNetwork';
import { sanitizeUrl, sanitizeUrlForLogging } from '../sanitizer';
import { CloudAuthRedirectError } from './cloudAuthRedirects';
import { createDecompressionInterceptor, stripDecompressionHeaders } from './decompress';
import {
  extractRateLimitErrorCode,
  extractRateLimitErrorType,
  getAbortError,
  HttpRateLimitError,
  type SystemError,
} from './errors';
import { isPrivateRangeGuardContextActive } from './guardContext';
import {
  isPromptfooCloudApiHost,
  monkeyPatchFetch,
  preserveCloudAuthRedirects,
} from './monkeyPatchFetch';
import { isRedirectStatus } from './redirectStatus';
import { getEffectiveRequestSignal } from './requestSignal';
import { readWithResponseDeadline, trackResponseDeadline } from './responseDeadline';
import { getFetchRetryContextMaxRetries } from './retryContext';

import type { FetchOptions } from './types';

export type FetchRateLimitObservation = {
  headers: Record<string, string>;
  status: number;
  resetAt: number;
};

// Credential failures are not transient HTTP failures and must not be retried by this layer.
class RequestAuthenticationError extends Error {}

async function resolveAuthenticationHeaders(
  getAuthHeaders: NonNullable<FetchOptions['getAuthHeaders']>,
  explicitHeaders: HeadersInit | undefined,
  signal: AbortSignal | null | undefined,
): Promise<Record<string, string>> {
  signal?.throwIfAborted();
  let headers: Headers;
  try {
    headers = new Headers(await getAuthHeaders(signal ?? undefined));
  } catch (error) {
    signal?.throwIfAborted();
    throw Object.assign(
      new RequestAuthenticationError(
        error instanceof Error ? error.message : 'Request authentication failed',
      ),
      { cause: error },
    );
  }
  signal?.throwIfAborted();
  // Never mutate the original headers: a retry must not inherit the previous attempt's token.
  new Headers(explicitHeaders).forEach((value, name) => headers.set(name, value));
  return Object.fromEntries(headers);
}

type ActiveAgent = { key: string; dispatcher: Dispatcher; users: number };
const activeAgents = new Map<string, ActiveAgent>();
// Limit retained transport configurations, independently of how many requests are in flight.
const MAX_IDLE_AGENTS = 32;
const idleAgents = new Map<string, Dispatcher>();

/**
 * Get the connection pool size for HTTP agents.
 * Priority: PROMPTFOO_FETCH_CONNECTIONS env var > CLI -j flag > DEFAULT_MAX_CONCURRENCY (4).
 * Set PROMPTFOO_FETCH_CONNECTIONS to override independently of eval concurrency
 * (e.g., server deployments that need more connections than the default 4).
 */
function getConnectionPoolSize(): number {
  const envConnections = getEnvString('PROMPTFOO_FETCH_CONNECTIONS');
  if (envConnections != null) {
    const normalized = envConnections.trim();
    const parsed = Number(normalized);
    if (/^\d+$/.test(normalized) && Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return cliState.maxConcurrency || DEFAULT_MAX_CONCURRENCY;
}

/**
 * Close cached dispatchers on shutdown and between tests.
 */
export function clearAgentCache(): void {
  activeAgents.clear(); // Outstanding calls close their dispatcher on last release.
  for (const agent of idleAgents.values()) {
    if (typeof agent.close === 'function') {
      agent.close();
    }
  }
  idleAgents.clear();
}

function createAgent(
  proxyUrl: string,
  tlsOptions: ConnectionOptions,
  connections: number,
  headersTimeout: number,
): Dispatcher {
  const options = {
    connections,
    headersTimeout,
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
  };
  const agent = proxyUrl
    ? new ProxyAgent({ ...options, uri: proxyUrl, proxyTls: tlsOptions, requestTls: tlsOptions })
    : new Agent({ ...options, connect: tlsOptions });
  return agent.compose(createDecompressionInterceptor()).compose(stripDecompressionHeaders());
}

function acquireAgent(proxyUrl: string, tlsOptions: ConnectionOptions): ActiveAgent {
  const connections = getConnectionPoolSize();
  const headersTimeout = getRequestTimeoutMs();
  // Hash the effective settings so cache keys don't retain proxy credentials or CA bundles.
  const key = sha256(JSON.stringify([proxyUrl, tlsOptions, connections, headersTimeout]));
  const active = activeAgents.get(key);
  if (active) {
    active.users++;
    return active;
  }
  const dispatcher =
    idleAgents.get(key) ?? createAgent(proxyUrl, tlsOptions, connections, headersTimeout);
  idleAgents.delete(key);
  const entry = { key, dispatcher, users: 1 };
  activeAgents.set(key, entry);
  return entry;
}

function releaseAgent(entry: ActiveAgent): void {
  if (--entry.users > 0) {
    return;
  }
  if (activeAgents.get(entry.key) !== entry) {
    // clearAgentCache ran while this request was pending.
    void entry.dispatcher.close();
    return;
  }
  activeAgents.delete(entry.key);
  idleAgents.set(entry.key, entry.dispatcher);
  if (idleAgents.size > MAX_IDLE_AGENTS) {
    const [key, oldest] = idleAgents.entries().next().value!;
    idleAgents.delete(key);
    // Undici drains outstanding response bodies before closing the dispatcher.
    void oldest.close();
  }
}

/**
 * Resolve whether to disable transient-error retries. An explicit caller flag
 * always wins (a caller may opt back in even when the provider set
 * `maxRetries: 0`); otherwise we disable only when the retry context carries
 * `maxRetries === 0`.
 */
function resolveTransientRetryDisabled(explicit?: boolean): boolean {
  if (explicit !== undefined) {
    return explicit;
  }
  return getFetchRetryContextMaxRetries() === 0;
}

function headersInitToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(new Headers(headers).entries());
  }

  return { ...headers };
}

export function getFetchWithProxyHeaders(
  url: RequestInfo,
  options: FetchOptions,
): Record<string, string> {
  const requestHeaders =
    url instanceof Request && options.headers === undefined ? headersInitToRecord(url.headers) : {};
  const optionHeaders = headersInitToRecord(options.headers);

  return {
    ...requestHeaders,
    ...optionHeaders,
    'x-promptfoo-version': VERSION,
  };
}

function getFetchUrlString(url: RequestInfo): string | undefined {
  if (typeof url === 'string') {
    return url;
  }
  if (url instanceof URL) {
    return url.toString();
  }
  if (url instanceof Request) {
    return url.url;
  }
  return undefined;
}

const MAX_GUARDED_REDIRECT_HOPS = 5;

// Credentials dropped when a guarded redirect crosses origins, mirroring what
// fetch strips automatically in 'follow' mode.
const CROSS_ORIGIN_REDIRECT_DROP_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
]);

// Entity headers that must not survive a 301/302/303 downgrade to GET.
const BODY_HEADERS = new Set([
  'content-length',
  'content-type',
  'content-encoding',
  'content-language',
]);

function stripHeadersByName(headers: Record<string, string>, names: Set<string>): void {
  for (const name of Object.keys(headers)) {
    if (names.has(name.toLowerCase())) {
      delete headers[name];
    }
  }
}

/**
 * True when a request body is a web ReadableStream that can be teed for
 * replay across redirect hops. String, Buffer, and other replayable bodies
 * need no tee; async-iterable bodies have no tee and keep their existing
 * behavior.
 */
function isTeeableStreamBody(body: unknown): body is ReadableStream {
  return (
    typeof body === 'object' && body !== null && typeof (body as ReadableStream).tee === 'function'
  );
}

/**
 * Compute the request options for following a redirect hop, mirroring the
 * fetch spec: 301/302/303 downgrade to GET with the body dropped (303 for any
 * non-HEAD method), 307/308 preserve method and body, and credentials are
 * dropped when crossing origins.
 */
function buildRedirectHopOptions(
  status: number,
  currentUrl: string,
  nextUrl: string,
  currentOptions: FetchOptions & { dispatcher?: any },
): FetchOptions & { dispatcher?: any } {
  const nextOptions: FetchOptions & { dispatcher?: any } = {
    ...currentOptions,
    headers: { ...headersInitToRecord(currentOptions.headers) },
  };
  const headers = nextOptions.headers as Record<string, string>;
  const method = (nextOptions.method || 'GET').toUpperCase();
  const downgradeToGet =
    status === 303 ? method !== 'HEAD' : (status === 301 || status === 302) && method === 'POST';
  if (downgradeToGet) {
    nextOptions.method = 'GET';
    delete nextOptions.body;
    stripHeadersByName(headers, BODY_HEADERS);
  }
  if (new URL(nextUrl).origin !== new URL(currentUrl).origin) {
    if (currentOptions.restrictCloudAuthRedirects) {
      // The request carries the Cloud credential under a custom header name,
      // which the native-follow path binds to the initial origin via
      // restrictCloudAuthRedirects. Rebinding the dispatcher per hop would
      // leak that header to the redirect destination, so refuse the hop
      // instead, mirroring the CloudAuthRedirectError the unguarded path
      // raises on a cross-origin redirect.
      throw new CloudAuthRedirectError();
    }
    stripHeadersByName(headers, CROSS_ORIGIN_REDIRECT_DROP_HEADERS);
  }
  return nextOptions;
}

/**
 * Follow redirects manually, re-validating every destination against the
 * private-range guard. Used only inside a guarded server-route context
 * (see `guardContext.ts`):
 * the default `redirect: 'follow'` would let a publicly-resolving URL 302
 * into link-local/cloud-metadata space after the preflight check passed.
 *
 * Redirect semantics mirror the fetch spec for the common cases (301/302/303
 * downgrade to GET with the body dropped; 307/308 preserve method and body).
 * The caller's redirect mode is preserved: the follow loop runs only for
 * callers whose mode was `follow` (or unset, which defaults to `follow`).
 * A `manual` caller gets the first response untouched, so it can inspect the
 * Location itself, and an `error` caller gets a rejection on a redirect
 * response, matching what native fetch would do.
 */
async function fetchWithRedirectValidation(
  initialUrl: string,
  options: FetchOptions & { dispatcher?: any },
  tlsOptions: ConnectionOptions,
): Promise<Response> {
  // Providers can derive URLs after route preflight (for example raw HTTP
  // request targets and OAuth token endpoints). Validate the actual first
  // destination for every redirect mode before sending a request.
  await assertUrlResolvesPublic(initialUrl);
  let currentUrl = initialUrl;
  let currentOptions: FetchOptions & { dispatcher?: any } = {
    ...options,
    redirect: 'manual',
  };
  // Cloud-auth injection eligibility is bound to the initial request:
  // monkeyPatchFetch re-injects the saved Cloud token on any hop whose URL
  // matches the Cloud origin, so a caller-controlled public URL that
  // redirects into the Cloud origin must be barred from injection on every
  // hop. buildRedirectHopOptions spreads currentOptions per hop, which
  // carries this flag through the whole chain.
  if (!isPromptfooCloudApiHost(initialUrl)) {
    currentOptions.skipCloudAuthInjection = true;
  }
  // `redirect: 'manual'` stops after the first 3xx, so recompute the
  // dispatcher per hop: proxy selection depends on the hop's URL. A
  // caller-supplied dispatcher (e.g. mTLS) is kept for every hop.
  const callerDispatcher = options.dispatcher;

  // Preserve the caller's redirect mode: only `follow` (the default) enters
  // the follow loop. A `manual` caller gets the first response untouched so
  // it can inspect the Location itself, and an `error` caller gets a
  // rejection on a redirect response, matching native fetch. Following every
  // redirect here would silently break both contracts.
  if ((options.redirect ?? 'follow') !== 'follow') {
    let hopAgent: ActiveAgent | undefined;
    if (!callerDispatcher) {
      const hopProxyUrl = getProxyForUrl(currentUrl);
      hopAgent = acquireAgent(hopProxyUrl, tlsOptions);
      currentOptions.dispatcher = hopAgent.dispatcher;
    }
    try {
      const response = await monkeyPatchFetch(currentUrl, currentOptions);
      if (
        options.redirect === 'error' &&
        isRedirectStatus(response.status) &&
        response.headers.get('location')
      ) {
        await response.body?.cancel().catch(() => undefined);
        throw new TypeError(
          'fetch failed: redirects are not allowed for a request with redirect mode "error"',
        );
      }
      return response;
    } finally {
      if (hopAgent) {
        releaseAgent(hopAgent);
      }
    }
  }

  for (let hop = 0; hop <= MAX_GUARDED_REDIRECT_HOPS; hop++) {
    let hopAgent: ActiveAgent | undefined;
    if (!callerDispatcher) {
      const hopProxyUrl = getProxyForUrl(currentUrl);
      hopAgent = acquireAgent(hopProxyUrl, tlsOptions);
      currentOptions.dispatcher = hopAgent.dispatcher;
    }

    try {
      // A stream body can only be consumed once, but a 307/308 hop must
      // replay it: tee the stream before each hop and carry the untouched
      // branch forward, so the next hop gets a fresh stream instead of the
      // disturbed one. Native fetch replays the POST the same way; without
      // this the second fetch fails on the disturbed stream. A stream that
      // cannot be teed (already disturbed or locked) is left for the fetch
      // to fail on as it would have before.
      let carriedBody: ReadableStream | undefined;
      if (isTeeableStreamBody(currentOptions.body)) {
        try {
          const [branch, rest] = currentOptions.body.tee();
          currentOptions.body = branch;
          carriedBody = rest;
        } catch {
          // Leave the body untouched; the fetch below fails as before.
        }
      }

      const response = await monkeyPatchFetch(currentUrl, currentOptions);
      const location = response.headers.get('location');
      if (!isRedirectStatus(response.status) || !location) {
        return response;
      }
      // Discard the redirect response's body to release its socket before
      // following it. Cancel instead of draining: the body is untrusted and
      // may be huge or never-ending, so it must never be buffered in memory.
      await response.body?.cancel().catch(() => undefined);

      if (hop === MAX_GUARDED_REDIRECT_HOPS) {
        throw new PrivateRangeBlockedError(
          `PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to follow more than ${MAX_GUARDED_REDIRECT_HOPS} redirects from ${JSON.stringify(sanitizeUrl(initialUrl))}`,
        );
      }

      const nextUrl = new URL(location, currentUrl).toString();
      // Fail closed: a public URL must not redirect into private space.
      await assertUrlResolvesPublic(nextUrl);

      const nextOptions = buildRedirectHopOptions(
        response.status,
        currentUrl,
        nextUrl,
        currentOptions,
      );
      // A downgrade (301/302/303 to GET) deletes the body, so only a
      // preserved-method hop replays the carried branch.
      if (carriedBody !== undefined && nextOptions.body !== undefined) {
        nextOptions.body = carriedBody;
      }

      logger.debug('[fetchWithProxy] Following guarded redirect', {
        from: sanitizeUrlForLogging(currentUrl),
        to: sanitizeUrlForLogging(nextUrl),
      });
      currentUrl = nextUrl;
      currentOptions = nextOptions;
    } finally {
      if (hopAgent) {
        releaseAgent(hopAgent);
      }
    }
  }

  // Unreachable: the loop either returns a response or throws.
  throw new Error('Unexpected end of redirect loop');
}

/**
 * Seed an options object with the fields a Request object carries itself.
 * The unguarded path passes the Request to the fetch implementation, so
 * those survive; the guarded path only forwards an options object and the
 * URL string, so without this seeding a guarded POST Request would silently
 * downgrade to a GET. Explicit options win over the Request-owned values,
 * mirroring fetch(Request, init).
 */
function seedRequestOwnedOptions(
  finalOptions: FetchOptions & { dispatcher?: any },
  url: RequestInfo,
): void {
  if (!(url instanceof Request)) {
    return;
  }
  finalOptions.method ??= url.method;
  if (finalOptions.body === undefined && url.body !== null) {
    finalOptions.body = url.body;
    // A stream body passed as init requires duplex, which the Request
    // itself carries but an init body does not inherit.
    (finalOptions as FetchOptions & { duplex?: 'half' }).duplex ??= 'half';
  }
  finalOptions.referrer ??= url.referrer;
  finalOptions.credentials ??= url.credentials;
  // A Request-owned redirect mode must survive the same way: the guarded
  // path forwards only the URL string plus an options object, so without
  // this seeding fetchWithRedirectValidation would see the default follow
  // mode instead of the Request's manual/error mode. Explicit options win,
  // mirroring fetch(Request, init).
  finalOptions.redirect ??= url.redirect;
}

export async function fetchWithProxy(
  url: RequestInfo,
  options: FetchOptions = {},
  abortSignal?: AbortSignal,
): Promise<Response> {
  options = preserveCloudAuthRedirects(url, options);
  let finalUrl = url;
  let finalUrlString = getFetchUrlString(url);

  if (!finalUrlString) {
    throw new Error('Invalid URL');
  }

  // Combine abort signals: incoming abortSignal parameter + any signal in options
  const requestSignal = getEffectiveRequestSignal(url, options);
  const combinedSignal = abortSignal
    ? requestSignal
      ? AbortSignal.any([requestSignal, abortSignal])
      : abortSignal
    : requestSignal;

  // This is overridden globally but Node v20 is still complaining so we need to add it here too
  const { getAuthHeaders, ...requestOptions } = options;
  const finalOptions: FetchOptions & { dispatcher?: Dispatcher } = {
    ...requestOptions,
    headers: getFetchWithProxyHeaders(url, options),
    signal: combinedSignal,
  };
  if (isPrivateRangeGuardContextActive()) {
    seedRequestOwnedOptions(finalOptions, url);
  }
  const logEnabled = new Headers(finalOptions.headers).get('x-promptfoo-silent') !== 'true';

  if (typeof url === 'string') {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.username || parsedUrl.password) {
        const headers = (finalOptions.headers ?? {}) as Record<string, string>;
        // Header names are case-insensitive, and a Headers instance or array lowercases them.
        // Matching only `Authorization` would add a second value that servers receive combined.
        if (Object.keys(headers).some((name) => name.toLowerCase() === 'authorization')) {
          if (logEnabled) {
            logger.warn(
              'Both URL credentials and Authorization header present - URL credentials will be ignored',
            );
          }
        } else {
          // Userinfo percent-encodes reserved characters, and HTTP clients decode it before
          // Basic auth, so a password written as p%40ss must authenticate as p@ss. A malformed
          // escape has no decoding and stays as written.
          const credentials = [parsedUrl.username, parsedUrl.password]
            .map((part) => {
              try {
                return decodeURIComponent(part);
              } catch {
                return part;
              }
            })
            .join(':');
          finalOptions.headers = {
            ...headers,
            Authorization: `Basic ${Buffer.from(credentials).toString('base64')}`,
          };
        }
        parsedUrl.username = '';
        parsedUrl.password = '';
        finalUrl = parsedUrl.toString();
        finalUrlString = finalUrl;
      }
    } catch (e) {
      if (logEnabled) {
        logger.debug(`URL parsing failed in fetchWithProxy: ${e}`);
      }
    }
  }

  // Keep caller-owned dispatchers (e.g. mTLS) outside the managed pool.
  if (finalOptions.dispatcher) {
    return fetchWithTransientRetries(finalUrl, finalOptions, getAuthHeaders, logEnabled);
  }

  const tlsOptions: ConnectionOptions = {
    rejectUnauthorized: !getEnvBool('PROMPTFOO_INSECURE_SSL', true),
  };

  // Support custom CA certificates
  const caCertPath = getEnvString('PROMPTFOO_CA_CERT_PATH');
  if (caCertPath) {
    try {
      const resolvedPath = path.resolve(cliState.basePath || '', caCertPath);
      const ca = await fsPromises.readFile(resolvedPath, 'utf8');
      tlsOptions.ca = ca;
      if (logEnabled) {
        logger.debug(`Using custom CA certificate from ${resolvedPath}`);
      }
    } catch (e) {
      if (logEnabled) {
        logger.warn(`Failed to read CA certificate from ${caCertPath}: ${e}`);
      }
    }
  }
  // Inside a guarded server-route context, redirects are followed manually so
  // every hop can be re-validated; otherwise a single automatic fetch is used.
  // The context is request-scoped: the process-wide
  // `PROMPTFOO_BLOCK_PRIVATE_RANGES` flag alone must not switch unrelated
  // callers in the same process (for example eval runs against local targets)
  // into private-hop validation.
  const guardRedirects = isPrivateRangeGuardContextActive();

  const proxyUrl = finalUrlString ? getProxyForUrl(finalUrlString) : '';

  if (proxyUrl && logEnabled) {
    logger.debug(`Using proxy: ${sanitizeUrl(proxyUrl)}`);
  }
  // Inside the guard context, do NOT bind a pooled dispatcher here:
  // fetchWithRedirectValidation reads options.dispatcher as the
  // caller-supplied dispatcher, and a pooled one would make it look
  // caller-supplied on every hop, so the per-hop proxy recomputation there
  // would never run. The validation function binds the per-hop dispatcher
  // itself.
  if (guardRedirects) {
    return fetchWithTransientRetries(
      finalUrl,
      finalOptions,
      getAuthHeaders,
      logEnabled,
      tlsOptions,
    );
  }
  // Hold the same transport across asynchronous auth, redirects and retry backoff.
  const agent = acquireAgent(proxyUrl, tlsOptions);
  finalOptions.dispatcher = agent.dispatcher;
  try {
    return await fetchWithTransientRetries(
      finalUrl,
      finalOptions,
      getAuthHeaders,
      logEnabled,
      tlsOptions,
    );
  } finally {
    releaseAgent(agent);
  }
}

async function fetchWithTransientRetries(
  url: RequestInfo,
  options: FetchOptions,
  getAuthHeaders: FetchOptions['getAuthHeaders'],
  logEnabled: boolean,
  tlsOptions?: ConnectionOptions,
): Promise<Response> {
  // Transient error retry logic (502/503/504/524 with matching status text).
  // When a provider sets maxRetries: 0 and the caller did not pass an explicit
  // disableTransientRetries, honor the provider intent via the retry context.
  const disableTransientRetries = resolveTransientRetryDisabled(options.disableTransientRetries);
  const maxTransientRetries = disableTransientRetries ? 0 : 3;

  // Inside a guarded server-route context, redirects are followed manually so
  // every hop can be re-validated; otherwise a single automatic fetch is used.
  // The context is request-scoped: the process-wide
  // `PROMPTFOO_BLOCK_PRIVATE_RANGES` flag alone must not switch unrelated
  // callers in the same process (for example eval runs against local targets)
  // into private-hop validation.
  // The caller-owned dispatcher path never reaches the TLS options here
  // because the guard keeps the caller dispatcher for every hop, so the
  // fallback is unused on that path.
  const guardRedirects = isPrivateRangeGuardContextActive();
  const doSingleFetch = (options: FetchOptions & { dispatcher?: any }): Promise<Response> =>
    guardRedirects
      ? fetchWithRedirectValidation(getFetchUrlString(url) ?? '', options, tlsOptions ?? {})
      : monkeyPatchFetch(url, options);

  for (let attempt = 0; attempt <= maxTransientRetries; attempt++) {
    let attemptOptions = options;
    if (getAuthHeaders) {
      attemptOptions = {
        ...options,
        headers: await resolveAuthenticationHeaders(
          getAuthHeaders,
          options.headers,
          options.signal,
        ),
      };
    }
    const response = await doSingleFetch(attemptOptions);

    if (!disableTransientRetries && isTransientError(response) && attempt < maxTransientRetries) {
      const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      if (logEnabled) {
        logger.debug(
          `Transient error (${response.status} ${response.statusText}), retry ${attempt + 1}/${maxTransientRetries} after ${backoffMs}ms`,
        );
      }
      await sleep(backoffMs);
      continue;
    }

    return response;
  }

  // This should be unreachable, but TypeScript needs it
  throw new Error('Unexpected end of transient retry loop');
}

export function fetchWithTimeout(
  url: RequestInfo,
  options: FetchOptions = {},
  configuredTimeout: number | `${number}`,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timeoutController = new AbortController();

    // Combine timeout signal with any incoming abort signal
    // The composite signal will abort if EITHER signal aborts
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutController.signal])
      : timeoutController.signal;

    // Provider config templates can render numeric settings as strings.
    const timeout = Number(configuredTimeout);
    const expiresAt = performance.now() + timeout;
    const timeoutId = setTimeout(() => {
      timeoutController.abort();
      reject(new Error(`Request timed out after ${timeout} ms`));
    }, timeout);

    fetchWithProxy(url, {
      ...options,
      signal,
    })
      .then((response) => {
        clearTimeout(timeoutId);
        trackResponseDeadline(response, { controller: timeoutController, expiresAt, timeout });
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}
/**
 * Check if a response indicates rate limiting
 */
export function isRateLimited(response: Response): boolean {
  // These checks helps make sure we set up tests correctly.
  invariant(response.headers, 'Response headers are missing');
  invariant(response.status, 'Response status is missing');

  // Check for OpenAI specific rate limit headers and status codes
  return (
    response.headers.get('X-RateLimit-Remaining') === '0' ||
    response.status === 429 ||
    // OpenAI specific error codes
    response.headers.get('x-ratelimit-remaining-requests') === '0' ||
    response.headers.get('x-ratelimit-remaining-tokens') === '0'
  );
}

/**
 * Compute how long to wait after a rate-limited response.
 * Reads `retry-after-ms`, `Retry-After`, `X-RateLimit-Reset`, and OpenAI-style reset headers.
 * Default: 60s.
 */
export function computeRateLimitWaitMs(response: Response): number {
  const parsedHeaders = parseRateLimitHeaders(Object.fromEntries(response.headers.entries()));
  const rateLimitReset = response.headers.get('X-RateLimit-Reset');
  const openaiReset =
    response.headers.get('x-ratelimit-reset-requests') ||
    response.headers.get('x-ratelimit-reset-tokens');

  if (openaiReset) {
    if (parsedHeaders.resetAt !== undefined) {
      return Math.max(parsedHeaders.resetAt - Date.now(), 0);
    }
  }

  if (rateLimitReset) {
    const resetAt = Number.parseInt(rateLimitReset, 10) * 1000;
    if (Number.isFinite(resetAt) && resetAt >= 0) {
      return Math.max(resetAt - Date.now() + 1000, 0);
    }
  }

  return parsedHeaders.retryAfterMs ?? 60_000;
}

/**
 * Maximum jitter (in ms) added to rate-limit waits. Spreads concurrent
 * waiters so they don't all retry in the same instant after Retry-After.
 */
const RATE_LIMIT_JITTER_MS = 1000;

async function sleepWithAbort(waitTime: number, signal?: AbortSignal | null): Promise<void> {
  if (!signal) {
    await sleep(waitTime);
    return;
  }
  if (signal.aborted) {
    throw getAbortError(signal);
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, waitTime);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      reject(getAbortError(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Handle rate limiting by waiting the appropriate amount of time, plus a
 * uniform random jitter to avoid synchronized retry storms when many
 * concurrent requests hit the same rate limit.
 */
export async function handleRateLimit(
  response: Response,
  signal?: AbortSignal | null,
  onRateLimitBackoff?: (observation: FetchRateLimitObservation) => void,
): Promise<void> {
  const waitTime = computeRateLimitWaitMs(response);
  if (!signal?.aborted) {
    onRateLimitBackoff?.(
      Object.freeze({
        headers: Object.freeze(Object.fromEntries(response.headers.entries())),
        status: response.status,
        resetAt: Date.now() + waitTime,
      }),
    );
  }
  const jitter = Math.floor(Math.random() * RATE_LIMIT_JITTER_MS);
  const totalWait = waitTime + jitter;
  logger.debug(
    `Rate limited, waiting ${totalWait}ms (base ${waitTime}ms + ${jitter}ms jitter) before retry`,
  );
  await sleepWithAbort(totalWait, signal);
}

/**
 * Hard cap on bytes read from a 429 response body during classification.
 * A hostile or buggy upstream could otherwise stream a multi-MB body on
 * every 429, amplifying memory pressure under concurrent eval load. 64 KB
 * is well above any well-formed provider error envelope (typical OpenAI
 * / Anthropic JSON errors are <1 KB).
 */
const RATE_LIMIT_BODY_PEEK_BYTES = 64 * 1024;

/**
 * Read the body of a rate-limited response without consuming the original
 * stream. Returns the parsed body (JSON if parseable, else raw text).
 *
 * Why clone: `Response.text()` consumes the underlying stream. The original
 * response may still be observed by upstream wrappers (logging middleware,
 * monkey-patched fetch); cloning preserves their ability to read the body.
 *
 * Clone/read failures return `undefined`
 * unless the caller cancelled the unfinished peek. Losing the body code only
 * widens classification from `quota` to `rate_limit`, which is the safer
 * (retryable) side of the misclassification.
 */
async function peekRateLimitBody(
  response: Response,
  logEnabled: boolean,
  signal?: AbortSignal | null,
): Promise<unknown> {
  let cloned: Response;
  try {
    cloned = response.clone();
  } catch (err) {
    if (signal?.aborted) {
      throw getAbortError(signal);
    }
    if (logEnabled) {
      logger.debug(`[fetch] peekRateLimitBody: clone failed, skipping body code lookup: ${err}`);
    }
    return undefined;
  }

  let text: string;
  try {
    text = await readWithResponseDeadline(response, () =>
      readBoundedText(cloned, RATE_LIMIT_BODY_PEEK_BYTES, { requireStream: true }),
    );
  } catch (err) {
    if (signal?.aborted) {
      throw getAbortError(signal);
    }
    if (logEnabled) {
      logger.debug(`[fetch] peekRateLimitBody: body read failed: ${err}`);
    }
    return undefined;
  }

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    // Keep the raw bytes for diagnostics; no code is extractable.
    if (logEnabled) {
      logger.debug('[fetch] peekRateLimitBody: response body was not JSON');
    }
    return text;
  }
}

/**
 * Drain a Response's body into a string, but stop reading once `maxBytes`
 * have been collected. Each streamed chunk is bounded to the remaining
 * budget *before* it enters the in-memory buffer, so a single oversized
 * chunk cannot exceed `maxBytes` of retained memory. `requireStream` skips
 * streamless polyfills to guarantee bounded buffering for rate-limit peeking.
 * Other callers retain the legacy text fallback, which buffers before truncation.
 */
export async function readBoundedText(
  response: Response,
  maxBytes: number,
  options: { requireStream?: boolean } = {},
): Promise<string> {
  if (!response.body) {
    const contentLength = Number.parseInt(response.headers?.get?.('content-length') ?? '', 10);
    if (options.requireStream || (Number.isFinite(contentLength) && contentLength > maxBytes)) {
      return '';
    }
    const text = await response.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const room = maxBytes - total;
      // Use `.slice()` (copy), not `.subarray()` (view), so the upstream
      // buffer for an oversized chunk can be released after this iteration.
      const bounded = value.byteLength <= room ? value : value.slice(0, room);
      chunks.push(bounded);
      total += bounded.byteLength;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Reader cancellation can fail if the stream is already closed; safe to ignore.
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Retry-After / reset timing from a rate-limit response's headers, for callers
 * that build an {@link HttpRateLimitError} from an SDK error rather than a
 * `Response`. Keeps the header parsing in one place.
 */
export function rateLimitTimingFromHeaders(headers: Record<string, string>): {
  retryAfterMs?: number;
  resetAt?: number;
} {
  const parsed = parseRateLimitHeaders(headers);
  return { retryAfterMs: parsed.retryAfterMs, resetAt: parsed.resetAt };
}

export function buildHttpRateLimitError(
  response: { status: number; statusText?: string; headers?: Headers },
  body: unknown,
): HttpRateLimitError {
  const headers = Object.fromEntries(response.headers ?? []);
  const parsed = parseRateLimitHeaders(headers);
  return new HttpRateLimitError({
    status: response.status,
    statusText: response.statusText,
    retryAfterMs: parsed.retryAfterMs,
    resetAt: parsed.resetAt,
    code: extractRateLimitErrorCode(body),
    type: extractRateLimitErrorType(body),
    headers,
    body,
  });
}

/**
 * Check if a response indicates a transient server error that should be retried.
 * Matches specific status codes with their expected status text to avoid
 * retrying permanent failures (e.g., some APIs return 502 for auth errors).
 */
export function isTransientError(response: Response): boolean {
  if (!response?.statusText) {
    return false;
  }
  const statusText = response.statusText.toLowerCase();
  switch (response.status) {
    case 502:
      return statusText.includes('bad gateway');
    case 503:
      return statusText.includes('service unavailable');
    case 504:
      return statusText.includes('gateway timeout');
    case 524: // Cloudflare-specific timeout error
      return statusText.includes('timeout');
    default:
      return false;
  }
}

/**
 * Fetch with automatic retries and rate limit handling
 */
export type { FetchOptions } from './types';

/**
 * Decide what to do with a rate-limited response inside `fetchWithRetries`.
 *
 * Throws on hard-quota fail-fast or retry exhaustion (with a structured
 * {@link HttpRateLimitError} for status 429, or a plain `Error` for the soft
 * `X-RateLimit-Remaining=0` 200 case). Otherwise sleeps via
 * {@link handleRateLimit} and returns so the caller can `continue` the loop.
 */
/**
 * Returns a string form of a {@link RequestInfo} suitable for log output.
 * Strips basic-auth credentials and known sensitive query parameters (api_key,
 * token, password, signature, …) via {@link sanitizeUrl} so providers that
 * embed credentials in the URL (e.g. n8n webhooks, HTTP providers with
 * `?api_key=…`) do not leak them into retry diagnostics.
 */
function urlForLog(url: RequestInfo): string {
  const raw = typeof url === 'string' ? url : url.url;
  return sanitizeUrlForLogging(raw);
}

async function handleRateLimitedResponse(
  response: Response,
  url: RequestInfo,
  attempt: number,
  maxRetries: number,
  logEnabled: boolean,
  signal?: AbortSignal | null,
  onRateLimitBackoff?: (observation: FetchRateLimitObservation) => void,
): Promise<void> {
  // Only the 429 path produces a structured error. A 200 OK with
  // `X-RateLimit-Remaining=0` is a soft hint that we're approaching a limit —
  // sleep and retry, but constructing a "Rate limit exceeded: HTTP 200 OK"
  // error on retry exhaustion would be misleading and pointlessly buffers a
  // 64 KB body peek on every successful call.
  const isHardRateLimit = response.status === 429;
  const safeUrl = urlForLog(url);

  // Classify a 429 up front: `HttpRateLimitError` derives `kind` from the body
  // code / type and the Retry-After downgrade, so the fail-fast decision below
  // sees the same classification callers do.
  let rateLimitError: HttpRateLimitError | undefined;
  if (isHardRateLimit) {
    const body = await peekRateLimitBody(response, logEnabled, signal);
    rateLimitError = buildHttpRateLimitError(response, body);
  }

  // Hard quota failures (e.g. insufficient_quota) won't resolve on retry. Fail
  // fast with a structured error so the caller can stop instead of amplifying
  // load against an exhausted account.
  if (rateLimitError?.kind === 'quota') {
    if (logEnabled) {
      logger.debug(
        `Quota exhausted on URL ${safeUrl}: HTTP ${response.status} (code: ${rateLimitError.code}), failing fast.`,
      );
    }
    throw rateLimitError;
  }

  if (attempt >= maxRetries) {
    if (rateLimitError) {
      // No retries remain: throw a structured error instead of a bare string
      // so callers can read Retry-After / reset / code without re-parsing.
      if (logEnabled) {
        logger.debug(
          `Rate limited on URL ${safeUrl}: HTTP ${response.status} ${response.statusText}, attempt ${attempt + 1}/${maxRetries + 1}, no retries remain.`,
        );
      }
      throw rateLimitError;
    }
    throw new Error(
      `Rate limited: ${response.status} ${response.statusText} after ${maxRetries + 1} attempts`,
    );
  }

  if (logEnabled) {
    logger.debug(
      `Rate limited on URL ${safeUrl}: HTTP ${response.status} ${response.statusText}, attempt ${attempt + 1}/${maxRetries + 1}, waiting before retry...`,
    );
  }
  await handleRateLimit(response, signal, onRateLimitBackoff);
}

function formatFetchErrorMessage(error: unknown, url: RequestInfo): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const typedError = error as SystemError;
  const rawUrl = typeof url === 'string' ? url : url.url;
  const redactUrl = (value: string) => value.split(rawUrl).join(urlForLog(url));
  let message = `${typedError.name}: ${redactUrl(typedError.message)}`;
  if (typedError.cause) {
    message += ` (Cause: ${redactUrl(String(typedError.cause))})`;
  }
  if (typedError.code) {
    message += ` (Code: ${typedError.code})`;
  }
  return message;
}

export async function fetchWithRetries(
  url: RequestInfo,
  options: FetchOptions = {},
  timeout: number,
  maxRetries?: number,
  onRateLimitBackoff?: (observation: FetchRateLimitObservation) => void,
): Promise<Response> {
  options = preserveCloudAuthRedirects(url, options);
  const contextMaxRetries = getFetchRetryContextMaxRetries();
  maxRetries = Math.max(0, maxRetries ?? contextMaxRetries ?? 4);

  let lastErrorMessage: string | undefined;
  const backoff = getEnvInt('PROMPTFOO_REQUEST_BACKOFF_MS', 5000);
  const signal = getEffectiveRequestSignal(url, options);
  const logEnabled =
    new Headers(getFetchWithProxyHeaders(url, options)).get('x-promptfoo-silent') !== 'true';

  for (let i = 0; i <= maxRetries; i++) {
    let response;
    try {
      // Disable transient retries in fetchWithProxy to avoid double-retrying
      response = await fetchWithTimeout(
        url,
        { ...options, disableTransientRetries: true },
        timeout,
      );

      if (getEnvBool('PROMPTFOO_RETRY_5XX') && response.status >= 500 && response.status < 600) {
        throw new Error(`Internal Server Error: ${response.status} ${response.statusText}`);
      }

      if (response && isRateLimited(response)) {
        await handleRateLimitedResponse(
          response,
          url,
          i,
          maxRetries,
          logEnabled,
          signal,
          onRateLimitBackoff,
        );
        continue;
      }

      return response;
    } catch (error) {
      // Don't retry on abort - propagate immediately
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      // Preserve completed policy and rate-limit diagnostics even if cancellation
      // arrives after the response. These failures never consume another retry.
      // A private-range policy failure is final too: retrying it would replay
      // the original request (including non-idempotent POSTs) against the
      // public endpoint that redirected into private space.
      if (
        error instanceof CloudAuthRedirectError ||
        error instanceof HttpRateLimitError ||
        error instanceof PrivateRangeBlockedError ||
        error instanceof RequestAuthenticationError
      ) {
        throw error;
      }
      if (signal?.aborted) {
        throw getAbortError(signal);
      }

      const errorMessage = formatFetchErrorMessage(error, url);

      if (logEnabled) {
        logger.debug(
          `Request to ${urlForLog(url)} failed (attempt #${i + 1}), retrying: ${errorMessage}`,
        );
      }
      if (i < maxRetries) {
        const waitTime = Math.pow(2, i) * (backoff + 1000 * Math.random());
        await sleepWithAbort(waitTime, signal);
      }
      lastErrorMessage = errorMessage;
    }
  }
  throw new Error(`Request failed after ${maxRetries} retries: ${lastErrorMessage}`);
}
