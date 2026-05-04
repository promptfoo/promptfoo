import { fetchWithCache } from './cache';
import { getShareApiBaseUrl } from './constants';
import logger from './logger';

const API_BASE_URL = `${getShareApiBaseUrl()}/v1`;

/**
 * Personally identifiable information span reported by a guardrail endpoint.
 *
 * @beta
 */
export interface GuardPiiFinding {
  /** Entity class reported by the guardrail service. */
  entity_type: string;
  /** Zero-based inclusive start offset within the inspected text. */
  start: number;
  /** Zero-based exclusive end offset within the inspected text. */
  end: number;
  /** Matched text reported by the guardrail service. */
  pii: string;
}

/**
 * One guardrail classification result for an inspected input.
 *
 * @beta
 */
export interface GuardResultEntry {
  /** Boolean decision for each guardrail category. */
  categories: Record<string, boolean>;
  /** Numeric confidence score for each guardrail category. */
  category_scores: Record<string, number>;
  /** Whether any category flagged the inspected input. */
  flagged: boolean;
  /** Optional endpoint-specific payload such as PII spans. */
  payload?: {
    pii?: GuardPiiFinding[];
  };
}

/**
 * Response returned by the `guard()`, `pii()`, and `harm()` guardrail helpers.
 *
 * @beta
 */
export interface GuardResult {
  /** Model used by the guardrail service. */
  model: string;
  /** Classification results returned for the inspected input. */
  results: GuardResultEntry[];
}

/**
 * Request accepted by `guardrails.adaptive()`.
 *
 * @beta
 */
export interface AdaptiveRequest {
  /** Prompt text to inspect and optionally rewrite. */
  prompt: string;
  /** Policy identifiers that should guide the adaptive rewrite. */
  policies?: string[];
}

/**
 * One rewrite applied by `guardrails.adaptive()`.
 *
 * @beta
 */
export interface AdaptiveModification {
  /** Service-defined modification category. */
  type: string;
  /** Human-readable explanation for the rewrite. */
  reason: string;
  /** Original prompt fragment before rewriting. */
  original: string;
  /** Replacement prompt fragment after rewriting. */
  modified: string;
}

/**
 * Response returned by `guardrails.adaptive()`.
 *
 * @beta
 */
export interface AdaptiveResult {
  /** Model used by the adaptive guardrail service. */
  model: string;
  /** Prompt after all adaptive rewrites have been applied. */
  adaptedPrompt: string;
  /** Ordered list of rewrites applied to the prompt. */
  modifications: AdaptiveModification[];
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

/**
 * Programmatic access to promptfoo guardrail endpoints.
 *
 * @beta
 */
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
