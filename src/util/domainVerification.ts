import { fetchWithProxy } from './fetch/index';

export interface VerificationResult {
  url: string;
  status?: number;
  exists: boolean | null;
  error?: string;
  duration: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

function createAbortController(timeoutMs: number): {
  controller: AbortController;
  timerId: ReturnType<typeof setTimeout>;
} {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timerId };
}

export async function verifyGithubRepo(
  owner: string,
  repo: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<VerificationResult> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const startTime = Date.now();
  const { controller, timerId } = createAbortController(timeoutMs);

  try {
    const response = await fetchWithProxy(
      url,
      {
        method: 'HEAD',
        headers: { 'User-Agent': 'promptfoo-redteam' },
      },
      controller.signal,
    );

    clearTimeout(timerId);

    return {
      url,
      status: response.status,
      exists: response.status !== 404,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    clearTimeout(timerId);
    const duration = Date.now() - startTime;

    if (error instanceof Error && error.name === 'AbortError') {
      return { url, exists: null, error: 'timeout', duration };
    }

    return {
      url,
      exists: null,
      error: error instanceof Error ? error.message : 'unknown error',
      duration,
    };
  }
}

export async function verifyHttpUrl(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<VerificationResult> {
  const startTime = Date.now();

  try {
    new URL(url);
  } catch {
    return {
      url,
      exists: null,
      error: 'invalid url',
      duration: Date.now() - startTime,
    };
  }

  const { controller, timerId } = createAbortController(timeoutMs);

  try {
    const response = await fetchWithProxy(
      url,
      {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': 'promptfoo-redteam' },
      },
      controller.signal,
    );

    clearTimeout(timerId);

    return {
      url,
      status: response.status,
      exists: response.status !== 404,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    clearTimeout(timerId);
    const duration = Date.now() - startTime;

    if (error instanceof Error && error.name === 'AbortError') {
      return { url, exists: null, error: 'timeout', duration };
    }

    return {
      url,
      exists: null,
      error: error instanceof Error ? error.message : 'unknown error',
      duration,
    };
  }
}
