import { fetchWithCache } from './cache';
import { getShareApiBaseUrl } from './constants';
import { getEnvString } from './envars';
import { cloudConfig } from './globalConfig/cloud';
import logger from './logger';

function resolveGuardrailsApi(): {
  baseUrl: string;
  headers: Record<string, string>;
  skipCloudAuthInjection?: boolean;
} {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // An explicit PROMPTFOO_REMOTE_API_BASE_URL override always wins, so users who
  // point guardrails at a private endpoint keep that behavior even when logged in.
  // Otherwise prefer the configured cloud host (incl. on-prem), falling back to the
  // public share host.
  let base: string;
  let skipCloudAuthInjection: boolean | undefined;
  const override = getEnvString('PROMPTFOO_REMOTE_API_BASE_URL');
  if (override) {
    base = override;
  } else {
    const config = cloudConfig.getRequestConfig();
    base = config.headers ? config.apiHost : getShareApiBaseUrl();
    Object.assign(headers, config.headers);
    // Keep this request on the captured session if login changes before dispatch.
    skipCloudAuthInjection = true;
  }

  // The guardrails service uses a `/v1` prefix (not `/api/v1` like most cloud
  // endpoints); this preserves the existing public-cloud routing. Strip any
  // trailing slash on the base so we never produce `//v1/...`.
  return { baseUrl: `${base.replace(/\/+$/, '')}/v1`, headers, skipCloudAuthInjection };
}

export interface GuardResult {
  model: string;
  results: Array<{
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
    flagged: boolean;
    payload?: {
      pii?: Array<{
        entity_type: string;
        start: number;
        end: number;
        pii: string;
      }>;
    };
  }>;
}

export interface AdaptiveRequest {
  prompt: string;
  policies?: string[];
}

export interface AdaptiveResult {
  model: string;
  adaptedPrompt: string;
  modifications: Array<{
    type: string;
    reason: string;
    original: string;
    modified: string;
  }>;
}

async function makeRequest(endpoint: string, input: string): Promise<GuardResult> {
  try {
    const { baseUrl, headers, skipCloudAuthInjection } = resolveGuardrailsApi();
    const response = await fetchWithCache(
      `${baseUrl}${endpoint}`,
      {
        method: 'POST',
        headers,
        ...(skipCloudAuthInjection ? { skipCloudAuthInjection } : {}),
        body: JSON.stringify({ input }),
      },
      undefined,
      'json',
    );

    if (!response.data) {
      throw new Error('No data returned from API');
    }

    return response.data as GuardResult;
  } catch (error) {
    logger.error(`Guardrails API error: ${error}`);
    throw error;
  }
}

async function makeAdaptiveRequest(request: AdaptiveRequest): Promise<AdaptiveResult> {
  try {
    const { baseUrl, headers, skipCloudAuthInjection } = resolveGuardrailsApi();
    const response = await fetchWithCache(
      `${baseUrl}/adaptive`,
      {
        method: 'POST',
        headers,
        ...(skipCloudAuthInjection ? { skipCloudAuthInjection } : {}),
        body: JSON.stringify({
          prompt: request.prompt,
          policies: request.policies || [],
        }),
      },
      undefined,
      'json',
    );

    if (!response.data) {
      throw new Error('No data returned from API');
    }

    return response.data as AdaptiveResult;
  } catch (error) {
    logger.error(`Guardrails API error: ${error}`);
    throw error;
  }
}

const guardrails = {
  async guard(input: string): Promise<GuardResult> {
    return makeRequest('/guard', input);
  },

  async pii(input: string): Promise<GuardResult> {
    return makeRequest('/pii', input);
  },

  async harm(input: string): Promise<GuardResult> {
    return makeRequest('/harm', input);
  },

  async adaptive(request: AdaptiveRequest): Promise<AdaptiveResult> {
    return makeAdaptiveRequest(request);
  },
};

export default guardrails;
