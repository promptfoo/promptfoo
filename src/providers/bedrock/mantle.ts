import { getEnvString } from '../../envars';

import type { EnvOverrides } from '../../types/env';

/**
 * Whether a Bedrock OpenAI model id is a frontier model served through the Responses API
 * (a bare `openai.` id that is not an open-weight `gpt-oss` model).
 */
export function isBedrockOpenAiResponsesModel(modelName: string): boolean {
  return modelName.startsWith('openai.') && !modelName.includes('gpt-oss');
}

/**
 * Whether a Bedrock model id is a bare xAI Grok id (for example, `xai.grok-4.3`).
 *
 * @param modelName The Bedrock model identifier to evaluate.
 * @returns `true` when the model id is an xAI Grok model served as `xai.grok-*`; otherwise `false`.
 */
export function isBedrockGrokModel(modelName: string): boolean {
  return modelName.startsWith('xai.grok-');
}

/**
 * Inference-profile ids for Grok models that Bedrock serves natively through
 * InvokeModel/Converse rather than the mantle endpoint.
 *
 * Grok 4.6 reports `inferenceTypesSupported: ["INFERENCE_PROFILE"]`, so it is invocable only
 * through these profile ids — and with ordinary AWS credentials, not a mantle bearer token.
 * Its bare `xai.grok-4.6` id is served by mantle instead. Earlier Grok models (grok-4.3) are
 * mantle-only and have no inference profile. Verified live 2026-08-31 in us-west-2.
 */
const NATIVE_GROK_PROFILE_MODELS: ReadonlySet<string> = new Set([
  'us.xai.grok-4.6',
  'global.xai.grok-4.6',
]);

/**
 * Whether a Bedrock model id is a Grok inference profile served by the native
 * InvokeModel/Converse APIs (rather than the mantle Responses endpoint).
 */
export function isBedrockNativeGrokProfileModel(modelName: string): boolean {
  return NATIVE_GROK_PROFILE_MODELS.has(modelName);
}

/**
 * Whether a prefixed Grok id must be rejected instead of routed.
 *
 * Inference profiles are never valid mantle ids, so an explicit `bedrock:mantle:` request for
 * one always fails. Otherwise a prefixed id is rejected only when it names no real profile —
 * the Grok 4.6 profiles are served natively and route on to InvokeModel/Converse.
 *
 * @param modelName The routed Bedrock model id.
 * @param explicitMantleRequest Whether the caller used the `bedrock:mantle:` subtype.
 */
export function isRejectedPrefixedGrokId(
  modelName: string,
  explicitMantleRequest: boolean,
): boolean {
  if (!modelName.includes('.xai.')) {
    return false;
  }
  return explicitMantleRequest || !isBedrockNativeGrokProfileModel(modelName);
}

/** Whether a Bedrock model id is served through the mantle Responses API. */
export function isBedrockMantleResponsesModel(modelName: string): boolean {
  return isBedrockOpenAiResponsesModel(modelName) || isBedrockGrokModel(modelName);
}

// Region resolution intentionally mirrors AwsBedrockGenericProvider.getRegion()
// (src/providers/bedrock/base.ts): same config.region → AWS_BEDROCK_REGION head
// plus AWS_REGION/AWS_DEFAULT_REGION fallbacks. The mantle providers wrap other
// provider classes rather than extending AwsBedrockGenericProvider, so they
// can't reuse getRegion() directly — keep this chain in sync if the canonical
// one changes. The default differs per route (frontier GA region vs Anthropic
// Messages region), so callers pass it in.
export function resolveBedrockMantleRegion(
  config: Record<string, any>,
  env: EnvOverrides | undefined,
  defaultRegion: string,
): string {
  return (
    config.region ||
    env?.AWS_BEDROCK_REGION ||
    getEnvString('AWS_BEDROCK_REGION') ||
    env?.AWS_REGION ||
    env?.AWS_DEFAULT_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    defaultRegion
  );
}

export function resolveBedrockMantleApiKey(
  config: Record<string, any>,
  env?: EnvOverrides,
): string | undefined {
  // Ignore an unresolved `{{ env.* }}` template (the referenced var wasn't set). Otherwise the
  // literal would be sent as the bearer token and the eval would fail with a confusing 401
  // instead of the actionable missing-key error the factories raise; fall through to the env
  // var instead.
  const explicitKey =
    typeof config.apiKey === 'string' && !config.apiKey.includes('{{') ? config.apiKey : undefined;
  return explicitKey || env?.AWS_BEARER_TOKEN_BEDROCK || getEnvString('AWS_BEARER_TOKEN_BEDROCK');
}

export function getBedrockMantleOrigin(region: string): string {
  // Reject malformed regions before interpolating a host that receives a bearer token.
  if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)) {
    throw new Error(
      `Invalid AWS region "${region}" for the Bedrock mantle endpoint. Expected a region like ` +
        `"us-east-2". Set a valid region via config.region, AWS_BEDROCK_REGION, or AWS_REGION ` +
        `(or supply config.apiBaseUrl to target a custom endpoint).`,
    );
  }
  return `https://bedrock-mantle.${region}.api.aws`;
}
