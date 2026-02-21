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

import type { ApiProvider } from '../../types/providers';
import type { ProbeRequest, ProbeHttpRequest, ProbeHttpResult, ReadyPayload } from '../../types/targetLink';
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

        // Follow redirects manually to capture each hop
        const redirects: Array<{ url: string; statusCode: number }> = [];
        let currentUrl = fullUrl;
        let response: Response | undefined;

        do {
          response = await fetch(currentUrl, {
            method,
            headers: headers as HeadersInit,
            body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
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
          } else {
            break;
          }
        } while (redirects.length < 10);

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

function appendQueryParams(
  url: string,
  queryParams?: Record<string, string>,
): string {
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return url;
  }
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(queryParams)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.href;
}

function classifyHttpError(error: unknown): string {
  const code = (error as { code?: string }).code;
  if (code === 'ENOTFOUND') {
    return 'dns';
  }
  if (code === 'ECONNREFUSED') {
    return 'connection_refused';
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
    return 'timeout';
  }
  if (
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'CERT_HAS_EXPIRED' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID'
  ) {
    return 'tls';
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return 'timeout';
  }
  return 'unknown';
}

function parseWwwAuthenticate(
  header: string | null,
): ProbeHttpResult['authScheme'] | undefined {
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
