import useApiConfig from '@app/stores/apiConfig';
import type {
  EvalConfigResponse,
  EvalResultDetailResponse,
  GetUserIdResponse,
  GetUserResponse,
} from '@promptfoo/contracts';
import type { UpdateEvalAuthorResponse } from '@promptfoo/types/api/eval';

export type { EvalConfigResponse, EvalResultDetailResponse };

const RESULT_DETAIL_CACHE_LIMIT = 50;
const EVAL_CONFIG_CACHE_LIMIT = 3;

const resultDetailCache = new Map<string, Promise<EvalResultDetailResponse>>();
const evalConfigCache = new Map<string, Promise<EvalConfigResponse>>();

export function getApiBaseUrl(): string {
  const { apiBaseUrl } = useApiConfig.getState();
  if (apiBaseUrl) {
    return apiBaseUrl.replace(/\/$/, '');
  }
  // Use base path from build-time config for local deployments behind reverse proxy
  return import.meta.env.VITE_PUBLIC_BASENAME || '';
}

export async function callApi(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${getApiBaseUrl()}/api${path}`, options);
}

function cacheKey(path: string): string {
  return `${getApiBaseUrl()}/api${path}`;
}

function getCached<T>(cache: Map<string, Promise<T>>, key: string): Promise<T> | undefined {
  const value = cache.get(key);
  if (value) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

function setCached<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  value: Promise<T>,
  maxEntries: number,
) {
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const abortHandler = () => {
      reject(createAbortError());
    };

    signal.addEventListener('abort', abortHandler, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abortHandler);
    });
  });
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let message = fallbackMessage;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

function fetchJsonCached<T>({
  path,
  signal,
  cache,
  maxEntries,
  fallbackMessage,
}: {
  path: string;
  signal?: AbortSignal;
  cache: Map<string, Promise<T>>;
  maxEntries: number;
  fallbackMessage: string;
}): Promise<T> {
  const key = cacheKey(path);
  const cached = getCached(cache, key);
  if (cached !== undefined) {
    return withAbortSignal(cached, signal);
  }

  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  const request = callApi(path)
    .then((response) => parseJsonResponse<T>(response, fallbackMessage))
    .catch((error) => {
      cache.delete(key);
      throw error;
    });
  setCached(cache, key, request, maxEntries);
  return withAbortSignal(request, signal);
}

export function clearEvalApiResponseCache(evalId?: string) {
  if (!evalId) {
    resultDetailCache.clear();
    evalConfigCache.clear();
    return;
  }

  const encodedEvalId = encodeURIComponent(evalId);
  const pathFragment = `/eval/${encodedEvalId}`;
  for (const key of resultDetailCache.keys()) {
    if (key.includes(pathFragment)) {
      resultDetailCache.delete(key);
    }
  }
  for (const key of evalConfigCache.keys()) {
    if (key.includes(pathFragment)) {
      evalConfigCache.delete(key);
    }
  }
}

export async function fetchUserEmail(): Promise<string | null> {
  try {
    const response = await callApi('/user/email', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user email');
    }

    const data: GetUserResponse = await response.json();
    return data.email;
  } catch (error) {
    console.error('Error fetching user email:', error);
    return null;
  }
}

export async function fetchUserId(): Promise<string | null> {
  try {
    const response = await callApi('/user/id', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user ID');
    }

    const data: GetUserIdResponse = await response.json();
    return data.id;
  } catch (error) {
    console.error('Error fetching user ID:', error);
    return null;
  }
}

export async function fetchEvalResultDetail(
  evalId: string,
  resultId: string,
  signal?: AbortSignal,
): Promise<EvalResultDetailResponse> {
  return fetchJsonCached<EvalResultDetailResponse>({
    path: `/eval/${encodeURIComponent(evalId)}/results/${encodeURIComponent(resultId)}/detail`,
    signal,
    cache: resultDetailCache,
    maxEntries: RESULT_DETAIL_CACHE_LIMIT,
    fallbackMessage: 'Failed to fetch result detail',
  });
}

export async function prefetchEvalResultDetail(
  evalId: string,
  resultId: string,
): Promise<EvalResultDetailResponse | null> {
  try {
    return await fetchEvalResultDetail(evalId, resultId);
  } catch {
    return null;
  }
}

export async function fetchEvalConfig(
  evalId: string,
  signal?: AbortSignal,
): Promise<EvalConfigResponse> {
  return fetchJsonCached<EvalConfigResponse>({
    path: `/eval/${encodeURIComponent(evalId)}/config`,
    signal,
    cache: evalConfigCache,
    maxEntries: EVAL_CONFIG_CACHE_LIMIT,
    fallbackMessage: 'Failed to fetch eval config',
  });
}

export async function prefetchEvalConfig(evalId: string): Promise<EvalConfigResponse | null> {
  try {
    return await fetchEvalConfig(evalId);
  } catch {
    return null;
  }
}

export async function updateEvalAuthor(
  evalId: string,
  author: string,
): Promise<UpdateEvalAuthorResponse> {
  const response = await callApi(`/eval/${evalId}/author`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ author }),
  });

  if (!response.ok) {
    throw new Error('Failed to update eval author');
  }

  return response.json();
}
