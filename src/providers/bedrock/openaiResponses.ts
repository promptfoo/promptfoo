import { getEnvString } from '../../envars';
import { OpenAiResponsesProvider } from '../openai/responses';

import type { EnvOverrides } from '../../types/env';
import type { ProviderOptions } from '../../types/providers';

/**
 * OpenAI's frontier models on Amazon Bedrock (gpt-5.5, gpt-5.4, ...) are NOT served
 * through the native `InvokeModel` / `Converse` APIs that back the rest of the `bedrock:`
 * provider. They are only available through Bedrock's OpenAI-compatible **Responses API**
 * on the regional "mantle" endpoint:
 *
 *   https://bedrock-mantle.<region>.api.aws/openai/v1/responses
 *
 * This module routes those model ids to promptfoo's OpenAI Responses provider pointed at
 * that endpoint, so `bedrock:openai.gpt-5.5` produces output identical to the OpenAI
 * Platform `openai:responses:gpt-5.5` provider. The open-weight `gpt-oss` models, by
 * contrast, are served via `InvokeModel` and continue to use the standard Bedrock path.
 */

/** GA region for the OpenAI frontier models on Bedrock; used when none is configured. */
export const DEFAULT_BEDROCK_OPENAI_REGION = 'us-east-2';

/**
 * Whether a Bedrock OpenAI model id is a frontier model served through the Responses API
 * (everything in the `openai.` namespace except the open-weight `gpt-oss` models). Matches
 * region-prefixed ids too (e.g. `us.openai.gpt-5.5`) so they don't fall through to the
 * InvokeModel path.
 */
export function isBedrockOpenAiResponsesModel(modelName: string): boolean {
  return modelName.includes('openai.') && !modelName.includes('gpt-oss');
}

/**
 * Build the regional Bedrock mantle base URL for the OpenAI frontier models.
 *
 * NOTE: the path is `/openai/v1`, not `/v1`. Verified live against gpt-5.5/gpt-5.4: the
 * frontier models are served under the `/openai/v1/responses` path and return HTTP 400
 * ("does not support the '/v1/responses' API") on the bare `/v1` path. The bare `/v1` path
 * documented in the AWS Mantle guide serves the open-weight `gpt-oss` models instead — and
 * those return 400 on `/openai/v1`. Do not "simplify" this to `/v1`.
 */
export function getBedrockMantleBaseUrl(region: string): string {
  // Guard against a malformed region silently producing a bogus host: a value like
  // `evil.com/x` would yield host `bedrock-mantle.evil.com`, redirecting the Bedrock bearer
  // token. region is operator-controlled (config/env), never request-derived, so this is
  // defense-in-depth plus a clearer failure than the opaque TLS/DNS error a bad region causes.
  if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)) {
    throw new Error(
      `Invalid AWS region "${region}" for the Bedrock mantle endpoint. Expected a region like ` +
        `"us-east-2". Set a valid region via config.region, AWS_BEDROCK_REGION, or AWS_REGION ` +
        `(or supply config.apiBaseUrl to target a custom endpoint).`,
    );
  }
  return `https://bedrock-mantle.${region}.api.aws/openai/v1`;
}

// Region precedence for the frontier provider. This intentionally extends
// AwsBedrockGenericProvider.getRegion() (src/providers/bedrock/base.ts): the same
// config.region → AWS_BEDROCK_REGION head, plus AWS_REGION/AWS_DEFAULT_REGION fallbacks and a
// us-east-2 default (the frontier GA region) instead of base.ts's us-east-1. The frontier
// provider wraps OpenAiResponsesProvider rather than extending AwsBedrockGenericProvider, so it
// can't reuse getRegion() directly — keep this chain in sync if the canonical one changes.
function resolveRegion(config: Record<string, any>, env?: EnvOverrides): string {
  return (
    config.region ||
    env?.AWS_BEDROCK_REGION ||
    getEnvString('AWS_BEDROCK_REGION') ||
    env?.AWS_REGION ||
    env?.AWS_DEFAULT_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    DEFAULT_BEDROCK_OPENAI_REGION
  );
}

function resolveApiKey(config: Record<string, any>, env?: EnvOverrides): string | undefined {
  // Ignore an unresolved `{{ env.* }}` template (the referenced var wasn't set). Otherwise the
  // literal would be sent as the bearer token and the eval would fail with a confusing 401
  // instead of the actionable missing-key error below; fall through to the env var instead.
  const explicitKey =
    typeof config.apiKey === 'string' && !config.apiKey.includes('{{') ? config.apiKey : undefined;
  return explicitKey || env?.AWS_BEARER_TOKEN_BEDROCK || getEnvString('AWS_BEARER_TOKEN_BEDROCK');
}

/**
 * OpenAI Responses provider for Bedrock frontier models. Behaves exactly like the OpenAI
 * Platform provider (shared request/response/usage handling).
 *
 * Bedrock model ids carry an `openai.` prefix (e.g. `openai.gpt-5.5`), which the base
 * provider's GPT-5 detection (`gpt-5*` / `/gpt-5`) and billing lookups don't recognize.
 * Without this, GPT-5 controls (reasoning effort, verbosity) would be dropped and a
 * `temperature` default wrongly applied. We strip the prefix for those capability/billing
 * checks while still sending the real `openai.gpt-5.5` id as the request `model` — Bedrock
 * mirrors OpenAI first-party rates, so the OpenAI billing tables apply.
 */
export class BedrockOpenAiResponsesProvider extends OpenAiResponsesProvider {
  /**
   * Strip the Bedrock `openai.` prefix (and any region prefix such as `us.`) so the base
   * provider's GPT-5 / o-series capability detection and the OpenAI billing tables match.
   * The request still sends the real `this.modelName` (e.g. `openai.gpt-5.5`) as the model id.
   */
  protected getCapabilityModelName(): string {
    return this.modelName.replace(/^.*?openai\./, '');
  }

  /**
   * Pin requests to the Bedrock mantle endpoint configured on this provider. The base
   * `getApiUrl()` prefers `apiHost`/`OPENAI_API_HOST` over `apiBaseUrl`, so without this an
   * ambient `OPENAI_API_HOST` (set for an unrelated OpenAI-compatible provider) would hijack
   * Bedrock calls and send the Bedrock bearer token to the wrong host.
   */
  getApiUrl(): string {
    return this.config.apiBaseUrl || super.getApiUrl();
  }
}

/**
 * Construct an OpenAI Responses provider configured for a Bedrock frontier model. Resolves
 * the region (config → AWS_BEDROCK_REGION → AWS_REGION → default) and the Amazon Bedrock
 * API key (config.apiKey → AWS_BEARER_TOKEN_BEDROCK), and targets the mantle endpoint
 * unless the caller supplies an explicit `apiBaseUrl`.
 */
export function createBedrockOpenAiResponsesProvider(
  modelName: string,
  providerOptions: ProviderOptions & { id?: string } = {},
): OpenAiResponsesProvider {
  const config: Record<string, any> = providerOptions.config ?? {};
  const region = resolveRegion(config, providerOptions.env);
  const apiKey = resolveApiKey(config, providerOptions.env);

  if (!apiKey) {
    throw new Error(
      `Amazon Bedrock model "${modelName}" is an OpenAI frontier model served through ` +
        `Bedrock's OpenAI-compatible Responses API, which authenticates with an Amazon ` +
        `Bedrock API key. Set the AWS_BEARER_TOKEN_BEDROCK environment variable (or ` +
        `config.apiKey). See https://www.promptfoo.dev/docs/providers/aws-bedrock/#openai-models`,
    );
  }

  const apiBaseUrl = config.apiBaseUrl || getBedrockMantleBaseUrl(region);

  return new BedrockOpenAiResponsesProvider(modelName, {
    ...providerOptions,
    config: { ...config, apiBaseUrl, apiKey },
  });
}
