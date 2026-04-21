/**
 * CLI-side TargetLink helper.
 *
 * One-liner to wire probe handling onto an AgentClient:
 *   attachTargetLink(client, provider)
 *
 * Extracted from discover.ts's inline probe handler.
 */

import logger from '../../logger';
import { TargetLinkEvents } from '../../types/targetLink';
import { fetchWithProxy } from '../fetch';

import type { ApiProvider } from '../../types/providers';
import type {
  HttpErrorCategory,
  ProbeHttpRequest,
  ProbeHttpResult,
  ProbeRequest,
  ReadyPayload,
} from '../../types/targetLink';
import type { AgentClient } from './agentClient';

/**
 * Wire a target link onto an existing AgentClient.
 *
 * 1. Listens for PROBE events
 * 2. Calls provider.callApi(prompt) for each probe
 * 3. Emits PROBE_RESULT with the result
 * 4. Emits READY to unblock the server's waitForReady
 */
export function attachTargetLink(
  client: AgentClient,
  provider: ApiProvider,
  options?: { clientName?: string; capabilities?: string[] },
): void {
  // Set up probe handler BEFORE signaling ready
  client.on(TargetLinkEvents.PROBE, (payload: ProbeRequest) => {
    void (async () => {
      const { requestId, prompt } = payload;
      logger.debug('[TargetLink] Received probe request', { requestId });

      try {
        const response = await provider.callApi(prompt, {
          vars: {},
          prompt: { raw: prompt, label: 'target-link-probe' },
        });

        const output = response.output ?? '';
        client.emit(TargetLinkEvents.PROBE_RESULT, {
          requestId,
          output: typeof output === 'string' ? output : JSON.stringify(output),
          tokenUsage: response.tokenUsage
            ? {
                input: response.tokenUsage.prompt || 0,
                output: response.tokenUsage.completion || 0,
                total: response.tokenUsage.total || 0,
              }
            : undefined,
        });
      } catch (error) {
        client.emit(TargetLinkEvents.PROBE_RESULT, {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

  // Set up HTTP probe handler for setup agent
  client.on(TargetLinkEvents.PROBE_HTTP, (payload: ProbeHttpRequest) => {
    void (async () => {
      const { requestId, url, method = 'POST', headers, body, queryParams, tls: _tls } = payload;
      const startMs = Date.now();

      logger.debug('[TargetLink] Received HTTP probe request', { requestId, url, method });

      try {
        // Build URL with query params
        const fullUrl = appendQueryParams(url, queryParams);

        const { response, redirects, currentUrl } = await followRedirects(fullUrl, {
          method,
          headers: headers as HeadersInit,
          body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        });

        const rawBody = await response.text();

        // Parse WWW-Authenticate on 401
        const authScheme =
          response.status === 401
            ? parseWwwAuthenticate(response.headers.get('www-authenticate'))
            : undefined;

        // Build response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        const result: ProbeHttpResult = {
          requestId,
          success: response.ok,
          statusCode: response.status,
          headers: responseHeaders,
          rawResponse: rawBody.slice(0, 10_000),
          latencyMs: Date.now() - startMs,
          redirects: redirects.length > 0 ? redirects : undefined,
          finalUrl: redirects.length > 0 ? currentUrl : undefined,
          authScheme,
        };

        client.emit(TargetLinkEvents.PROBE_HTTP_RESULT, result);
      } catch (error) {
        client.emit(TargetLinkEvents.PROBE_HTTP_RESULT, {
          requestId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          errorCategory: classifyHttpError(error),
          latencyMs: Date.now() - startMs,
        });
      }
    })();
  });

  // Signal ready — unblocks server's waitForReady
  const readyPayload: ReadyPayload = {
    clientName: options?.clientName,
    capabilities: options?.capabilities,
  };
  client.emit(TargetLinkEvents.READY, readyPayload);
}

// ─── Helpers ──────────────────────────────────────────────

function appendQueryParams(url: string, queryParams?: Record<string, string>): string {
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return url;
  }
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(queryParams)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.href;
}

async function followRedirects(
  startUrl: string,
  init: { method: string; headers: HeadersInit; body?: string },
): Promise<{
  response: Response;
  redirects: Array<{ url: string; statusCode: number }>;
  currentUrl: string;
}> {
  const redirects: Array<{ url: string; statusCode: number }> = [];
  let currentUrl = startUrl;
  let response: Response;

  do {
    response = await fetchWithProxy(currentUrl, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirects.push({ url: currentUrl, statusCode: response.status });
      const location = response.headers.get('location');
      if (!location) {
        break;
      }
      currentUrl = new URL(location, currentUrl).href;

      // RFC 7231: 301/302/303 switch to GET and drop body; 307/308 preserve method
      if ([301, 302, 303].includes(response.status)) {
        init = { ...init, method: 'GET', body: undefined };
      }
    } else {
      break;
    }
  } while (redirects.length < 10);

  return { response, redirects, currentUrl };
}

/**
 * Classify a fetch/HTTP error into a category for the setup agent.
 *
 * Undici's fetch wraps real errors in TypeError("fetch failed") with the actual
 * error in `.cause` — we unwrap to get the real error code for classification.
 */
export function classifyHttpError(error: unknown): HttpErrorCategory {
  // Unwrap undici's TypeError("fetch failed") wrapper
  const cause = (error as { cause?: unknown }).cause;
  const realError = cause && typeof cause === 'object' ? cause : error;
  const code = (realError as { code?: string }).code ?? (error as { code?: string }).code;
  const message =
    ((realError as { message?: string }).message ?? '') +
    ' ' +
    ((error as { message?: string }).message ?? '');

  if (code === 'ENOTFOUND') {
    return 'dns';
  }
  if (code === 'ECONNREFUSED') {
    return 'connection_refused';
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return 'timeout';
  }
  if (
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'CERT_HAS_EXPIRED' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    // mTLS / SSL handshake failures (server requires client cert)
    code === 'ERR_SSL_TLSV1_ALERT_CERTIFICATE_REQUIRED' ||
    code === 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE' ||
    code === 'ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE' ||
    code?.startsWith('ERR_SSL_') ||
    code?.startsWith('ERR_TLS_')
  ) {
    return 'tls';
  }
  // ECONNRESET during TLS handshake (common mTLS failure mode)
  if (code === 'ECONNRESET' && message.toLowerCase().includes('ssl')) {
    return 'tls';
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return 'timeout';
  }
  return 'unknown';
}

function parseWwwAuthenticate(header: string | null): ProbeHttpResult['authScheme'] | undefined {
  if (!header) {
    return undefined;
  }
  const match = header.match(/^(\w+)\s*(.*)/);
  if (!match) {
    return undefined;
  }
  const scheme = match[1];
  const params: Record<string, string> = {};
  const paramRegex = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = paramRegex.exec(match[2])) !== null) {
    params[m[1]] = m[2];
  }
  return { scheme, realm: params.realm, params };
}
