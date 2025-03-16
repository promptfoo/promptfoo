import { fetchWithCache } from './cache';
import { SHARE_API_BASE_URL } from './constants';
import logger from './logger';

const API_BASE_URL = `${SHARE_API_BASE_URL}/v1`;

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
};

export default guardrails;
