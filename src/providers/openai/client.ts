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

export function getOpenAiHttpMetadata({
  headers,
  status,
  statusText,
}: {
  headers?: Record<string, string>;
  status: number;
  statusText: string;
}) {
  return {
    http: {
      status,
      statusText,
      headers: headers ?? {},
    },
  };
}

export function getOpenAiInvalidPromptCode(errorData: unknown): unknown {
  if (typeof errorData !== 'object' || errorData === null) {
    return undefined;
  }

  if (
    'error' in errorData &&
    typeof errorData.error === 'object' &&
    errorData.error !== null &&
    'code' in errorData.error
  ) {
    return errorData.error.code;
  }

  return 'code' in errorData ? errorData.code : undefined;
}

export function createJsonCachedOpenAiClient(options: JsonCachedOpenAiClientOptions) {
  const requestMetadata: OpenAiJsonRequestMetadata = {
    cached: false,
  };
  const timeout = options.timeout ?? getRequestTimeoutMs();
  const apiKey = getSdkApiKey(options.apiKey, options.allowMissingApiKey);

  const client = new OpenAI({
    apiKey,
    organization: options.organization,
    baseURL: options.baseURL,
    defaultHeaders: options.headers,
    maxRetries: 0,
    timeout,
    fetch: async (url, init = {}) => {
      const requestUrl = getRequestUrlString(url);
      const requestInit = stripSyntheticAuthorization(init, options.apiKey);
      if (isSdkUploadCapabilityProbe(requestUrl)) {
        return globalThis.fetch(url, requestInit);
      }
      const response = await fetchWithCache(
        requestUrl,
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

      const headers = new Headers(response.headers);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }

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
  const requestFetch = options.fetch ?? globalThis.fetch;
  const shouldWrapFetch = Boolean(options.fetch || (!options.apiKey && options.allowMissingApiKey));

  return new OpenAI({
    apiKey,
    organization: options.organization,
    baseURL: options.baseURL,
    defaultHeaders: options.headers,
    maxRetries: Math.max(0, options.maxRetries ?? 0),
    timeout: options.timeout ?? getRequestTimeoutMs(),
    fetch: shouldWrapFetch
      ? async (url, init = {}) => {
          const requestInit =
            !options.apiKey && options.allowMissingApiKey
              ? stripSyntheticAuthorization(init, options.apiKey)
              : init;
          const requestUrl = getRequestUrlString(url);
          if (isSdkUploadCapabilityProbe(requestUrl)) {
            return globalThis.fetch(url, requestInit);
          }
          return requestFetch(url, requestInit);
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

// Exported for tests. The OpenAI SDK probes upload capability with a `data:`
// URL. The exact form ("data:," today) is an implementation detail; match the
// scheme rather than the literal so future SDK versions keep bypassing the
// cache wrapper.
export function isSdkUploadCapabilityProbe(url: string) {
  return url.startsWith('data:');
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
