import { fetchWithCache } from './cache';
import { getShareApiBaseUrl } from './constants';
import { getEnvString } from './envars';
import { cloudConfig } from './globalConfig/cloud';
import logger from './logger';

function resolveGuardrailsApi(): { baseUrl: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // An explicit PROMPTFOO_REMOTE_API_BASE_URL override always wins, so users who
  // point guardrails at a private endpoint keep that behavior even when logged in.
  // Otherwise prefer the configured cloud host (incl. on-prem), falling back to the
  // public share host.
  let base: string;
  const override = getEnvString('PROMPTFOO_REMOTE_API_BASE_URL');
  if (override) {
    base = override;
  } else if (cloudConfig.isEnabled()) {
    base = cloudConfig.getApiHost();
    // The fetch layer injects the cloud bearer token for the configured cloud origin
    // (incl. on-prem) and won't override a header we set here, so attaching it
    // explicitly keeps this request authenticated regardless of fetch-layer changes.
    const apiKey = cloudConfig.getApiKey();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
  } else {
    base = getShareApiBaseUrl();
  }

  // The guardrails service uses a `/v1` prefix (not `/api/v1` like most cloud
  // endpoints); this preserves the existing public-cloud routing. Strip any
  // trailing slash on the base so we never produce `//v1/...`.
  return { baseUrl: `${base.replace(/\/+$/, '')}/v1`, headers };
}

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
    const { baseUrl, headers } = resolveGuardrailsApi();
    const response = await fetchWithCache(
      `${baseUrl}${endpoint}`,
      {
        method: 'POST',
        headers,
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
    const { baseUrl, headers } = resolveGuardrailsApi();
    const response = await fetchWithCache(
      `${baseUrl}/adaptive`,
      {
        method: 'POST',
        headers,
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
