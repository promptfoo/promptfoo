import { OpenAiResponsesProvider } from '../openai/responses';
import {
  getBedrockMantleOrigin,
  isBedrockGptOssResponsesModel,
  isBedrockGrokModel,
  resolveBedrockMantleApiKey,
  resolveBedrockMantleRegion,
} from './mantle';
import { BedrockTokenProvider } from './tokenProvider';

import type { ProviderOptions } from '../../types/providers';

type BedrockOpenAiResponsesBodyContext = Parameters<OpenAiResponsesProvider['getOpenAiBody']>[1];
type BedrockOpenAiResponsesCallApiOptions = Parameters<OpenAiResponsesProvider['getOpenAiBody']>[2];

/**
 * OpenAI's frontier models on Amazon Bedrock (GPT-5.6 Sol/Terra/Luna, GPT-5.5, GPT-5.4, ...)
 * are NOT served
 * through the native `InvokeModel` / `Converse` APIs that back the rest of the `bedrock:`
 * provider. They are only available through Bedrock's OpenAI-compatible **Responses API**
 * on the regional "mantle" endpoint:
 *
 *   https://bedrock-mantle.<region>.api.aws/openai/v1/responses
 *
 * This module routes those model ids to promptfoo's OpenAI Responses provider pointed at
 * that endpoint, so `bedrock:openai.gpt-5.6-sol` produces output identical to the OpenAI
 * Platform `openai:responses:gpt-5.6-sol` provider. Open-weight `gpt-oss` models keep their
 * legacy bare `bedrock:` InvokeModel route and use the explicit
 * `bedrock:responses:openai.gpt-oss-*` route for the standard mantle `/v1/responses` path.
 */

/** GA region for the OpenAI frontier models on Bedrock; used when none is configured. */
export const DEFAULT_BEDROCK_OPENAI_REGION = 'us-east-2';

/** Default region for standard mantle Responses models such as GPT OSS. */
export const DEFAULT_BEDROCK_MANTLE_RESPONSES_REGION = 'us-east-1';

/**
 * Launch Regions for the GPT-5.6 tiers, verified live against the mantle model catalog
 * (`GET /v1/models`) on 2026-07-13. AWS expands availability over time without notice —
 * gpt-5.4/gpt-5.5 later became servable in us-east-1 — so keep this table in sync with the
 * catalog: a stale entry hard-blocks a Region that actually serves the model. An explicit
 * `config.apiBaseUrl` bypasses this check.
 */
const BEDROCK_GPT_5_6_REGIONS: Record<string, readonly string[]> = {
  'openai.gpt-5.6-sol': ['us-east-1', 'us-east-2'],
  'openai.gpt-5.6-terra': ['us-east-1', 'us-east-2', 'us-west-2'],
  'openai.gpt-5.6-luna': ['us-east-1', 'us-east-2', 'us-west-2'],
};

/** Sole launch region for xAI Grok on Bedrock (us-west-2); used when none is configured. */
export const DEFAULT_BEDROCK_GROK_REGION = 'us-west-2';

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

/** Build the standard OpenAI-compatible mantle base URL documented for GPT OSS Responses. */
export function getBedrockMantleResponsesBaseUrl(region: string): string {
  return `${getBedrockMantleOrigin(region)}/v1`;
}

/**
 * OpenAI Responses provider for Bedrock frontier models. Behaves exactly like the OpenAI
 * Platform provider (shared request/response/usage handling).
 *
 * Bedrock model ids carry an `openai.` prefix (e.g. `openai.gpt-5.6-sol`), which the base
 * provider's GPT-5 detection (`gpt-5*` / `/gpt-5`) and billing lookups don't recognize.
 * Without this, GPT-5 controls (reasoning effort, verbosity) would be dropped and a
 * `temperature` default wrongly applied. We strip the prefix for those capability/billing
 * checks while still sending the real `openai.gpt-5.6-sol` id as the request `model` — Bedrock
 * mirrors OpenAI first-party rates, so the OpenAI billing tables apply.
 */
export class BedrockOpenAiResponsesProvider extends OpenAiResponsesProvider {
  private readonly bedrockTokenProvider: BedrockTokenProvider;

  constructor(
    modelName: string,
    providerOptions: ProviderOptions & { bedrockRegion?: string; id?: string } = {},
  ) {
    super(modelName, providerOptions);
    const config = providerOptions.config ?? {};
    const region =
      providerOptions.bedrockRegion ??
      resolveBedrockMantleRegion(config, providerOptions.env, DEFAULT_BEDROCK_OPENAI_REGION);
    this.bedrockTokenProvider = new BedrockTokenProvider(config, providerOptions.env, region);
  }

  protected async getApiKeyForRequest(): Promise<string | undefined> {
    return this.bedrockTokenProvider.getToken();
  }

  /**
   * Strip the Bedrock `openai.` prefix so the base provider's GPT-5 / o-series capability
   * detection and the OpenAI billing tables match. The request still sends the real
   * `this.modelName` (e.g. `openai.gpt-5.6-sol`) as the model id. Only bare `openai.` ids reach
   * this provider (see the routing predicates in `mantle.ts`), so no region prefix is expected.
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

  getOpenAiRequestHeaders(
    customHeaders: Record<string, string> | undefined = this.config.headers,
  ): Record<string, string> {
    // Ambient OpenAI organization/originator headers do not apply to Bedrock and can disclose
    // unrelated account metadata. Preserve only headers explicitly configured for this provider.
    return customHeaders ?? {};
  }

  protected shouldBustCache(): boolean {
    // The inherited fetch cache includes an HMAC fingerprint of Authorization in its
    // persistent identity. Bedrock exposes no non-secret account identifier for partitioning,
    // so bypass it instead of persisting a derivative of the Bedrock bearer token.
    return true;
  }
}

/**
 * Responses provider for xAI Grok on Bedrock (`xai.grok-4.3`). Shares the mantle Responses
 * transport with the OpenAI frontier provider, but Grok has its own request semantics:
 *
 * - The capability/billing name strips the `xai.` prefix (→ `grok-4.3`).
 * - Grok is reasoning-first with a configurable `reasoning.effort`, so promptfoo forwards
 *   `reasoning` / `reasoning_effort`. Grok also accepts explicit `temperature` and `top_p`; only
 *   the inherited OpenAI Responses temperature default is omitted when the caller does not set
 *   one.
 *
 * Cost is not computed for Grok: the Responses billing tables are keyed on OpenAI model names,
 * and `grok-4.3` is not present, so `cost` is left undefined rather than reported incorrectly.
 */
export class BedrockGrokResponsesProvider extends BedrockOpenAiResponsesProvider {
  protected getCapabilityModelName(): string {
    return this.modelName.replace(/^xai\./, '');
  }

  protected isReasoningModel(): boolean {
    return true;
  }

  protected supportsTemperature(): boolean {
    return true;
  }

  async getOpenAiBody(
    prompt: string,
    context?: BedrockOpenAiResponsesBodyContext,
    callApiOptions?: BedrockOpenAiResponsesCallApiOptions,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    // The base provider omits top_p for active reasoning, but Grok accepts an explicit value.
    if (result.config.top_p !== undefined && result.body.top_p === undefined) {
      result.body.top_p = result.config.top_p;
    }
    return result;
  }
}

/**
 * Responses provider for open-weight GPT OSS models on Bedrock mantle.
 *
 * These models use the standard /v1/responses mantle path and the shorter mantle model ids
 * (openai.gpt-oss-120b, not the InvokeModel id openai.gpt-oss-120b-1:0). GPT OSS accepts
 * reasoning effort plus explicit temperature/top_p, so preserve those controls while still
 * sending the real Bedrock model id.
 */
export class BedrockGptOssResponsesProvider extends BedrockOpenAiResponsesProvider {
  protected isReasoningModel(): boolean {
    return true;
  }

  protected supportsTemperature(): boolean {
    return true;
  }

  async getOpenAiBody(
    prompt: string,
    context?: BedrockOpenAiResponsesBodyContext,
    callApiOptions?: BedrockOpenAiResponsesCallApiOptions,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    if (result.config.top_p !== undefined && result.body.top_p === undefined) {
      result.body.top_p = result.config.top_p;
    }
    return result;
  }
}

function getBedrockResponsesBaseUrl(
  modelName: string,
  region: string,
  apiBaseUrl?: string,
): string {
  if (apiBaseUrl) {
    try {
      const url = new URL(apiBaseUrl);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error('invalid URL');
      }
      return apiBaseUrl.replace(/\/+$/, '');
    } catch {
      throw new Error(
        `Invalid apiBaseUrl for Amazon Bedrock model "${modelName}". Expected an absolute HTTP(S) ` +
          `URL without embedded credentials, query parameters, or a fragment, such as ` +
          `"https://bedrock-mantle.us-east-1.api.aws/v1".`,
      );
    }
  }

  const supportedRegions = BEDROCK_GPT_5_6_REGIONS[modelName];
  if (supportedRegions && !supportedRegions.includes(region)) {
    throw new Error(
      `Amazon Bedrock model "${modelName}" is not available in AWS region "${region}". ` +
        `Supported Regions: ${supportedRegions.join(', ')}.`,
    );
  }

  return modelName.startsWith('openai.') && !isBedrockGptOssResponsesModel(modelName)
    ? getBedrockMantleBaseUrl(region)
    : isBedrockGrokModel(modelName)
      ? getBedrockMantleBaseUrl(region)
      : getBedrockMantleResponsesBaseUrl(region);
}

/**
 * Construct an OpenAI Responses provider configured for a Bedrock model served on the mantle
 * endpoint — an OpenAI frontier model (`openai.gpt-5.x`) or an xAI Grok model (`xai.grok-4.3`).
 * Resolves the region (config → AWS_BEDROCK_REGION → AWS_REGION → family default), targets the
 * mantle endpoint unless the caller supplies an explicit `apiBaseUrl`, and authenticates with
 * either a configured Bedrock bearer token or a request-scoped token generated from AWS
 * credentials.
 */
export function createBedrockOpenAiResponsesProvider(
  modelName: string,
  providerOptions: ProviderOptions & { id?: string } = {},
): OpenAiResponsesProvider {
  const config: Record<string, any> = providerOptions.config ?? {};
  const isGrok = isBedrockGrokModel(modelName);
  const isGptOss = isBedrockGptOssResponsesModel(modelName);
  const region = resolveBedrockMantleRegion(
    config,
    providerOptions.env,
    isGrok
      ? DEFAULT_BEDROCK_GROK_REGION
      : isGptOss
        ? DEFAULT_BEDROCK_MANTLE_RESPONSES_REGION
        : DEFAULT_BEDROCK_OPENAI_REGION,
  );
  const apiBaseUrl = getBedrockResponsesBaseUrl(modelName, region, config.apiBaseUrl);
  const apiKey = resolveBedrockMantleApiKey(config, providerOptions.env);

  const ProviderClass = isGrok
    ? BedrockGrokResponsesProvider
    : isGptOss
      ? BedrockGptOssResponsesProvider
      : BedrockOpenAiResponsesProvider;

  return new ProviderClass(modelName, {
    ...providerOptions,
    bedrockRegion: region,
    config: {
      ...config,
      apiBaseUrl,
      ...(apiKey ? { apiKey } : {}),
      ...(isGrok ? { omitDefaults: true } : {}),
    },
  });
}
