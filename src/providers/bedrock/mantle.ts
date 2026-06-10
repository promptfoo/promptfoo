import { getEnvString } from '../../envars';

import type { EnvOverrides } from '../../types/env';

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
