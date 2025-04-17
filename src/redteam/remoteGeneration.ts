import { fetchWithCache, type FetchWithCacheResult } from '../cache';
import cliState from '../cliState';
import { getEnvBool, getEnvString } from '../envars';
import { fetchWithRetries } from '../fetch';
import { cloudConfig, CloudConfig } from '../globalConfig/cloud';
import { REQUEST_TIMEOUT_MS } from '../providers/shared';

export function getRemoteGenerationUrl(): string {
  // Check env var first
  const envUrl = getEnvString('PROMPTFOO_REMOTE_GENERATION_URL');
  if (envUrl) {
    return envUrl;
  }
  // If logged into cloud use that url + /task
  const cloudConfig = new CloudConfig();
  if (cloudConfig.isEnabled()) {
    return cloudConfig.getApiHost() + '/api/v1/task';
  }
  // otherwise use the default
  return 'https://api.promptfoo.app/api/v1/task';
}

export function remoteGenerationFetch(options: RequestInit): Promise<Response> {
  const apiKey = cloudConfig.getApiKey();
  return fetch(getRemoteGenerationUrl(), {
    ...options,
    headers: {
      ...options.headers,
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });
}

export function remoteGenerationFetchWithCache(
  options: RequestInit,
): Promise<FetchWithCacheResult<any>> {
  const apiKey = cloudConfig.getApiKey();
  return fetchWithCache(
    getRemoteGenerationUrl(),
    {
      ...options,
      headers: {
        ...options.headers,
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    },
    REQUEST_TIMEOUT_MS,
  );
}

export function remoteGenerationFetchWithRetries(options: RequestInit): Promise<Response> {
  const apiKey = cloudConfig.getApiKey();
  return fetchWithRetries(
    getRemoteGenerationUrl(),
    {
      ...options,
      headers: {
        ...options.headers,
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    },
    REQUEST_TIMEOUT_MS,
  );
}

export function neverGenerateRemote(): boolean {
  return getEnvBool('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION');
}

/**
 * Gets the URL for checking remote API health based on configuration.
 * @returns The health check URL, or null if remote generation is disabled.
 */
export function getRemoteHealthUrl(): string | null {
  if (neverGenerateRemote()) {
    return null;
  }

  const envUrl = getEnvString('PROMPTFOO_REMOTE_GENERATION_URL');
  if (envUrl) {
    try {
      const url = new URL(envUrl);
      url.pathname = '/health';
      return url.toString();
    } catch {
      return 'https://api.promptfoo.app/health';
    }
  }

  const cloudConfig = new CloudConfig();
  if (cloudConfig.isEnabled()) {
    return `${cloudConfig.getApiHost()}/health`;
  }

  return 'https://api.promptfoo.app/health';
}

export function shouldGenerateRemote(): boolean {
  // Generate remotely when the user has not disabled it and does not have an OpenAI key.
  return (!neverGenerateRemote() && !getEnvString('OPENAI_API_KEY')) || (cliState.remote ?? false);
}

export function getRemoteGenerationUrlForUnaligned(): string {
  // Check env var first
  const envUrl = getEnvString('PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT');
  if (envUrl) {
    return envUrl;
  }
  // If logged into cloud use that url + /task
  const cloudConfig = new CloudConfig();
  if (cloudConfig.isEnabled()) {
    return cloudConfig.getApiHost() + '/api/v1/task/harmful';
  }
  // otherwise use the default
  return 'https://api.promptfoo.app/api/v1/task/harmful';
}

export function unalignedRemoteGenerationFetchWithRetries(
  requestOptions: RequestInit,
  {
    timeout,
    maxRetries,
  }: {
    timeout: number;
    maxRetries: number;
  },
): Promise<Response> {
  const apiKey = cloudConfig.getApiKey();
  return fetchWithRetries(
    getRemoteGenerationUrlForUnaligned(),
    {
      ...requestOptions,
      headers: {
        ...requestOptions.headers,
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    },
    timeout,
    maxRetries,
  );
}
