import OpenAI from 'openai';
import { fetchWithCache } from '../../cache';
import { getRequestTimeoutMs } from '../shared';

type JsonCachedOpenAiClientOptions = {
  apiKey?: string;
  allowMissingApiKey?: boolean;
  organization?: string;
  baseURL: string;
  headers?: Record<string, string>;
  bustCache?: boolean;
  maxRetries?: number;
  timeout?: number;
};

type OpenAiClientOptions = {
  apiKey?: string;
  allowMissingApiKey?: boolean;
  organization?: string;
  baseURL: string;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
  maxRetries?: number;
  timeout?: number;
};

export type JsonCachedOpenAiRequestResult<T> =
  | {
      ok: true;
      data: T;
      requestMetadata: OpenAiJsonRequestMetadata;
    }
  | {
      ok: false;
      error: unknown;
      requestMetadata: OpenAiJsonRequestMetadata;
    };

export type OpenAiJsonRequestMetadata = {
  cached: boolean;
  data?: unknown;
  deleteFromCache?: () => Promise<void>;
  headers?: Record<string, string>;
  latencyMs?: number;
  status?: number;
  statusText?: string;
};

const SDK_ANONYMOUS_API_KEY = 'promptfoo-sdk-anonymous';

export function createJsonCachedOpenAiClient(options: JsonCachedOpenAiClientOptions) {
  const requestMetadata: OpenAiJsonRequestMetadata = {
    cached: false,
  };
  const timeout = options.timeout ?? getRequestTimeoutMs();
  const endpoint = getSdkEndpoint(options.baseURL);
  const apiKey = getSdkApiKey(options.apiKey, options.allowMissingApiKey);
  const ambientCustomHeaderNames = getAmbientOpenAiCustomHeaderNames(options.headers);

  const client = new OpenAI({
    apiKey,
    adminAPIKey: null,
    organization: options.organization ?? null,
    project: null,
    webhookSecret: null,
    baseURL: endpoint.baseURL,
    defaultHeaders: options.headers,
    maxRetries: 0,
    timeout,
    fetch: async (url, init = {}) => {
      const requestUrl = getRequestUrlString(url);
      const requestInit = sanitizeSdkRequestInit(
        init,
        options.apiKey,
        options.organization,
        ambientCustomHeaderNames,
      );
      if (requestUrl.startsWith('data:')) {
        return globalThis.fetch(url, requestInit);
      }
      const response = await fetchWithCache(
        withEndpointQuery(requestUrl, endpoint.query),
        requestInit,
        timeout,
        'json',
        options.bustCache ?? false,
        options.maxRetries,
      );

      requestMetadata.cached = response.cached;
      requestMetadata.data = response.data;
      requestMetadata.deleteFromCache = response.deleteFromCache;
      requestMetadata.headers = response.headers;
      requestMetadata.latencyMs = response.latencyMs;
      requestMetadata.status = response.status;
      requestMetadata.statusText = response.statusText;

      const headers = getReconstructedJsonHeaders(response.headers);

      return new Response(JSON.stringify(response.data), {
        headers,
        status: response.status,
        statusText: response.statusText,
      });
    },
  });

  return {
    client,
    requestMetadata,
  };
}

export async function callJsonCachedOpenAi<T>(
  options: JsonCachedOpenAiClientOptions,
  request: (client: OpenAI) => Promise<T>,
): Promise<JsonCachedOpenAiRequestResult<T>> {
  const { client, requestMetadata } = createJsonCachedOpenAiClient(options);

  try {
    return {
      ok: true,
      data: await request(client),
      requestMetadata,
    };
  } catch (error) {
    return {
      ok: false,
      error,
      requestMetadata,
    };
  }
}

export function createOpenAiClient(options: OpenAiClientOptions) {
  const apiKey = getSdkApiKey(options.apiKey, options.allowMissingApiKey);
  const endpoint = getSdkEndpoint(options.baseURL);
  const requestFetch = options.fetch ?? globalThis.fetch;
  const ambientCustomHeaderNames = getAmbientOpenAiCustomHeaderNames(options.headers);
  const shouldWrapFetch = Boolean(
    options.fetch ||
      (!options.apiKey && options.allowMissingApiKey) ||
      ambientCustomHeaderNames.size > 0 ||
      endpoint.query,
  );

  return new OpenAI({
    apiKey,
    adminAPIKey: null,
    organization: options.organization ?? null,
    project: null,
    webhookSecret: null,
    baseURL: endpoint.baseURL,
    defaultHeaders: options.headers,
    maxRetries: Math.max(0, options.maxRetries ?? 0),
    timeout: options.timeout ?? getRequestTimeoutMs(),
    fetch: shouldWrapFetch
      ? async (url, init = {}) => {
          const requestInit = sanitizeSdkRequestInit(
            init,
            options.apiKey,
            options.organization,
            ambientCustomHeaderNames,
          );
          const requestUrl = getRequestUrlString(url);
          if (requestUrl.startsWith('data:')) {
            return globalThis.fetch(url, requestInit);
          }
          return requestFetch(withEndpointQuery(requestUrl, endpoint.query), requestInit);
        }
      : undefined,
  });
}

export function unwrapOpenAiTransportError(err: unknown) {
  if (typeof err === 'object' && err !== null && 'cause' in err && err.cause instanceof Error) {
    return err.cause;
  }

  return err;
}

function getSdkApiKey(apiKey: string | undefined, allowMissingApiKey?: boolean) {
  return apiKey || (allowMissingApiKey ? SDK_ANONYMOUS_API_KEY : apiKey);
}

function stripSyntheticAuthorization(init: RequestInit, apiKey: string | undefined): RequestInit {
  if (apiKey) {
    return init;
  }

  const headers = new Headers(init.headers);
  if (headers.get('authorization') === `Bearer ${SDK_ANONYMOUS_API_KEY}`) {
    headers.delete('authorization');
  }

  return {
    ...init,
    headers,
  };
}

function sanitizeSdkRequestInit(
  init: RequestInit,
  apiKey: string | undefined,
  organization: string | undefined,
  ambientCustomHeaderNames: Set<string>,
): RequestInit {
  const requestInit = stripSyntheticAuthorization(init, apiKey);
  if (ambientCustomHeaderNames.size === 0) {
    return requestInit;
  }

  const headers = new Headers(requestInit.headers);
  for (const headerName of ambientCustomHeaderNames) {
    headers.delete(headerName);
    if (headerName === 'authorization' && apiKey) {
      headers.set('authorization', `Bearer ${apiKey}`);
    }
    if (headerName === 'openai-organization' && organization) {
      headers.set('openai-organization', organization);
    }
  }

  return {
    ...requestInit,
    headers,
  };
}

function getAmbientOpenAiCustomHeaderNames(headers?: Record<string, string>): Set<string> {
  const configuredHeaderNames = new Set(
    Object.keys(headers ?? {}).map((headerName) => headerName.toLowerCase()),
  );
  const ambientCustomHeaders = process.env.OPENAI_CUSTOM_HEADERS;
  if (!ambientCustomHeaders) {
    return new Set();
  }

  const ambientHeaderNames = new Set<string>();
  for (const line of ambientCustomHeaders.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex < 0) {
      continue;
    }

    const headerName = line.slice(0, colonIndex).trim().toLowerCase();
    if (headerName && !configuredHeaderNames.has(headerName)) {
      ambientHeaderNames.add(headerName);
    }
  }

  return ambientHeaderNames;
}

function getReconstructedJsonHeaders(headers?: Record<string, string>) {
  const reconstructedHeaders = new Headers(headers);
  reconstructedHeaders.set('content-type', 'application/json');

  for (const headerName of [
    'content-digest',
    'content-encoding',
    'content-length',
    'content-md5',
    'digest',
    'transfer-encoding',
  ]) {
    reconstructedHeaders.delete(headerName);
  }

  return reconstructedHeaders;
}

function getSdkEndpoint(baseURL: string) {
  const url = new URL(baseURL);
  const query = url.search;
  url.search = '';
  url.hash = '';
  return { baseURL: url.toString(), query };
}

function withEndpointQuery(requestUrl: string, query: string): string {
  if (!query) {
    return requestUrl;
  }
  const url = new URL(requestUrl);
  // Keep opaque values and repeated gateway parameters byte-for-byte. The SDK
  // otherwise appends resource paths inside a base URL's query string.
  url.search = query + (url.search ? `&${url.search.slice(1)}` : '');
  return url.toString();
}

function getRequestUrlString(url: RequestInfo | URL) {
  if (url instanceof URL) {
    return url.toString();
  }
  if (typeof url === 'string') {
    return url;
  }
  return url.url;
}
