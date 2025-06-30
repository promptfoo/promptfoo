import { fetchWithCache } from './cache';
import { getShareApiBaseUrl } from './constants';
import logger from './logger';

const API_BASE_URL = `${getShareApiBaseUrl()}/v1`;

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
    const response = await fetchWithCache(
      `${API_BASE_URL}${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
    const response = await fetchWithCache(
      `${API_BASE_URL}/adaptive`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
