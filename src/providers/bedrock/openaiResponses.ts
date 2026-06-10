import { OpenAiResponsesProvider } from '../openai/responses';
import {
  getBedrockMantleOrigin,
  resolveBedrockMantleApiKey,
  resolveBedrockMantleRegion,
} from './mantle';

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
 * (a bare `openai.` id that is not an open-weight `gpt-oss` model, e.g. `openai.gpt-5.5`).
 *
 * Only the bare ids are accepted. AWS's GPT-5.5 / GPT-5.4 model cards list just the bare model
 * ids and explicitly mark the Geo and Global inference IDs as "Not supported", so a
 * region/geo-prefixed id such as `us.openai.gpt-5.5` is not a real Bedrock model. Matching it
 * here would route an invalid id to the mantle endpoint; instead it falls through to a clear
 * error (see `getHandlerForModel` in ./index.ts) that points at the supported bare id.
 */
export function isBedrockOpenAiResponsesModel(modelName: string): boolean {
  return modelName.startsWith('openai.') && !modelName.includes('gpt-oss');
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
  return `${getBedrockMantleOrigin(region)}/openai/v1`;
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
   * Strip the Bedrock `openai.` prefix so the base provider's GPT-5 / o-series capability
   * detection and the OpenAI billing tables match. The request still sends the real
   * `this.modelName` (e.g. `openai.gpt-5.5`) as the model id. Only bare `openai.` ids reach
   * this provider (see {@link isBedrockOpenAiResponsesModel}), so no region prefix is expected.
   */
  protected getCapabilityModelName(): string {
    return this.modelName.replace(/^openai\./, '');
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
  const region = resolveBedrockMantleRegion(
    config,
    providerOptions.env,
    DEFAULT_BEDROCK_OPENAI_REGION,
  );
  const apiKey = resolveBedrockMantleApiKey(config, providerOptions.env);

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
