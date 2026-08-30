/**
 * Shared transport helpers for the Gemini Interactions API.
 *
 * The Interactions API (GA June 2026) replaces `generateContent` as Google's
 * primary interface: an `Interaction` resource holds the chronological sequence
 * of thoughts, tool calls, and outputs as `steps`, and can optionally be
 * persisted server-side so follow-up turns reference it by id instead of
 * resending history.
 *
 * Both the video-generation provider (`interactions.ts`, Gemini Omni) and the
 * chat/text provider (`interactionsChat.ts`) speak the same wire protocol, so
 * endpoint resolution, authentication, and usage accounting live here.
 *
 * @see https://ai.google.dev/gemini-api/docs/interactions-overview
 */

import { getEnvString } from '../../envars';
import { getNunjucksEngine } from '../../util/templates';
import { GoogleAuthManager } from './auth';

import type { EnvOverrides } from '../../types/env';
import type { CompletionOptions, GoogleProviderConfig } from './types';

/**
 * Interactions is still revision-pinned; sending the revision we were written
 * against keeps Google's documented breaking changes from silently reshaping
 * responses under us.
 */
export const INTERACTIONS_API_REVISION = '2026-05-20';

/** A single content part inside an interaction step. */
export type InteractionContent = {
  type?: string;
  text?: string;
  data?: string;
  uri?: string;
  mime_type?: string;
};

/**
 * One entry in an interaction's chronological timeline. `type` distinguishes
 * `user_input`, `model_output`, `thought`, `function_call`, `function_result`,
 * `google_search_call`/`google_search_result`, and the code-execution pair.
 */
export type InteractionStep = {
  type?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
  content?: InteractionContent[];
  error?: { message?: string };
  signature?: string;
};

export type InteractionUsage = {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_reasoning_tokens?: number;
  total_thought_tokens?: number;
  total_tool_use_tokens?: number;
  total_cached_tokens?: number;
  total_tokens?: number;
  input_tokens_by_modality?: Array<{ modality?: string; tokens?: number }>;
  tool_use_tokens_by_modality?: Array<{ modality?: string; tokens?: number }>;
  cached_tokens_by_modality?: Array<{ modality?: string; tokens?: number }>;
  output_tokens_by_modality?: Array<{ modality?: string; tokens?: number }>;
  grounding_tool_count?: Array<{ type?: string; count?: number; search_query_count?: number }>;
};

export type InteractionResponse = {
  id?: string;
  status?: string;
  model?: string;
  error?: { message?: string };
  steps?: InteractionStep[];
  usage?: InteractionUsage;
};

/** Resolve the Google AI Studio Interactions endpoint, honoring host overrides. */
export function getInteractionsEndpoint(config: CompletionOptions, env?: EnvOverrides): string {
  const endpointFromHost = (apiHost: string) => {
    const normalizedHost = /^https?:\/\//i.test(apiHost) ? apiHost : `https://${apiHost}`;
    return `${normalizedHost.replace(/\/$/, '')}/v1beta/interactions`;
  };

  if (config.apiHost) {
    return endpointFromHost(config.apiHost);
  }
  if (config.apiBaseUrl) {
    return `${config.apiBaseUrl.replace(/\/$/, '')}/v1beta/interactions`;
  }

  const apiHost = env?.GOOGLE_API_HOST || getEnvString('GOOGLE_API_HOST');
  if (apiHost) {
    return endpointFromHost(apiHost);
  }
  const apiBaseUrl = env?.GOOGLE_API_BASE_URL || getEnvString('GOOGLE_API_BASE_URL');
  if (apiBaseUrl) {
    return `${apiBaseUrl.replace(/\/$/, '')}/v1beta/interactions`;
  }
  return 'https://generativelanguage.googleapis.com/v1beta/interactions';
}

/**
 * Vertex serves Interactions only from these locations, and all three live on
 * the global `aiplatform.googleapis.com` host - there is no `us-aiplatform`
 * or `eu-aiplatform` regional host (both 404). Verified against the live API.
 */
const VERTEX_INTERACTIONS_GLOBAL_HOST_LOCATIONS = new Set(['global', 'us', 'eu']);

/** Resolve the Vertex AI Interactions endpoint for a project/region. */
export function getVertexInteractionsEndpoint(
  config: GoogleProviderConfig,
  projectId: string,
  env?: EnvOverrides,
): string {
  const region =
    config.region ||
    env?.VERTEX_REGION ||
    getEnvString('VERTEX_REGION') ||
    getEnvString('GOOGLE_CLOUD_LOCATION') ||
    'global';
  const configuredHost =
    config.apiBaseUrl ||
    config.apiHost ||
    env?.VERTEX_API_HOST ||
    getEnvString('VERTEX_API_HOST') ||
    (VERTEX_INTERACTIONS_GLOBAL_HOST_LOCATIONS.has(region)
      ? 'aiplatform.googleapis.com'
      : `${region}-aiplatform.googleapis.com`);
  const host = /^https?:\/\//i.test(configuredHost) ? configuredHost : `https://${configuredHost}`;
  return `${host.replace(/\/$/, '')}/v1beta1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}/interactions`;
}

export type InteractionsTransport = {
  endpoint: string;
  headers: Record<string, string>;
  /** Only set on the AI Studio route; Vertex authenticates with OAuth. */
  apiKey?: string;
};

/**
 * Resolve the endpoint and authenticated headers for an Interactions request.
 *
 * `label` prefixes Vertex-specific errors so callers can attribute failures to
 * the concrete provider (e.g. "Gemini Omni" vs "Gemini Interactions").
 */
export async function resolveInteractionsTransport(
  config: GoogleProviderConfig,
  env: EnvOverrides | undefined,
  options: { vertex?: boolean; label: string },
): Promise<InteractionsTransport | { error: string }> {
  const { vertex, label } = options;

  if (vertex) {
    try {
      const { client, projectId: authProjectId } = await GoogleAuthManager.getOAuthClient({
        credentials: config.credentials,
        googleAuthOptions: config.googleAuthOptions,
        keyFilename: config.keyFilename,
        scopes: config.scopes,
      });
      const projectId =
        config.projectId ||
        env?.VERTEX_PROJECT_ID ||
        env?.GOOGLE_PROJECT_ID ||
        env?.GOOGLE_CLOUD_PROJECT ||
        getEnvString('VERTEX_PROJECT_ID') ||
        getEnvString('GOOGLE_PROJECT_ID') ||
        getEnvString('GOOGLE_CLOUD_PROJECT') ||
        authProjectId;
      if (!projectId) {
        return {
          error: `${label} on Vertex AI requires a project ID. Set GOOGLE_CLOUD_PROJECT or add projectId to the provider config.`,
        };
      }
      const accessToken = await client.getAccessToken();
      const token = typeof accessToken === 'string' ? accessToken : accessToken?.token;
      if (!token) {
        return { error: `${label} on Vertex AI could not obtain an OAuth access token.` };
      }
      const endpoint = getVertexInteractionsEndpoint(config, projectId, env);
      const { authorization, ...authHeaders } =
        typeof client.getRequestHeaders === 'function'
          ? Object.fromEntries((await client.getRequestHeaders(endpoint)).entries())
          : {};
      return {
        endpoint,
        headers: {
          'Content-Type': 'application/json',
          'Api-Revision': INTERACTIONS_API_REVISION,
          Authorization: authorization || `Bearer ${token}`,
          ...authHeaders,
          ...config.headers,
        },
      };
    } catch (err) {
      return { error: `${label} Vertex AI authentication error: ${String(err)}` };
    }
  }

  const rawApiKey =
    GoogleAuthManager.getApiKey(config, env).apiKey ||
    env?.GOOGLE_GENERATIVE_AI_API_KEY ||
    getEnvString('GOOGLE_GENERATIVE_AI_API_KEY');
  const apiKey = rawApiKey ? getNunjucksEngine().renderString(rawApiKey, {}) : undefined;
  if (!apiKey) {
    return {
      error: `${label} requires an API key. Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or PALM_API_KEY, or add apiKey to the provider config.`,
    };
  }
  return {
    endpoint: getInteractionsEndpoint(config, env),
    headers: {
      'Content-Type': 'application/json',
      'Api-Revision': INTERACTIONS_API_REVISION,
      'x-goog-api-key': apiKey,
      ...config.headers,
    },
    apiKey,
  };
}

/** Sum reported tokens for the given modalities, ignoring negative values. */
export function getInteractionModalityTokenCount(
  details: Array<{ modality?: string; tokens?: number }> | undefined,
  modalities: string[],
): number {
  return (details || [])
    .filter((detail) => modalities.includes(detail.modality?.toLowerCase() || ''))
    .reduce((total, detail) => total + Math.max(detail.tokens ?? 0, 0), 0);
}

/**
 * Content parts of the model's response to the most recent user turn.
 *
 * Steps accumulate across turns when an interaction is reused via
 * `previous_interaction_id`, so anything before the last `user_input` belongs
 * to an earlier turn and must not be replayed as this turn's output.
 */
export function getModelOutputContent(data: InteractionResponse): InteractionContent[] {
  const steps = data.steps || [];
  const latestUserInput = steps.map((step) => step.type).lastIndexOf('user_input');
  return steps
    .slice(latestUserInput + 1)
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content || []);
}

/** Steps produced in response to the most recent user turn. */
export function getLatestTurnSteps(data: InteractionResponse): InteractionStep[] {
  const steps = data.steps || [];
  const latestUserInput = steps.map((step) => step.type).lastIndexOf('user_input');
  return steps.slice(latestUserInput + 1);
}
