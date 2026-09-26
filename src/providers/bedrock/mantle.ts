import { getEnvString } from '../../envars';

import type { EnvOverrides } from '../../types/env';

// Mantle supports AWS_REGION/AWS_DEFAULT_REGION in addition to Bedrock's region
// override. Provider values precede ambient aliases. The default differs per route
// (frontier GA region vs Anthropic Messages region), so callers pass it in.
export function resolveBedrockMantleRegion(
  config: Record<string, any>,
  env: EnvOverrides | undefined,
  defaultRegion: string,
): string {
  return (
    config.region ||
    env?.AWS_BEDROCK_REGION ||
    env?.AWS_REGION ||
    env?.AWS_DEFAULT_REGION ||
    getEnvString('AWS_BEDROCK_REGION') ||
    getEnvString('AWS_REGION') ||
    getEnvString('AWS_DEFAULT_REGION') ||
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
  // Explicit AWS credentials/profile select the target's principal ahead of environment
  // bearer tokens. Include partial tuples so validation fails instead of using another account.
  // Match the token provider's treatment of empty values and unresolved templates.
  const hasExplicitAwsCredentials = [
    'accessKeyId',
    'secretAccessKey',
    'sessionToken',
    'profile',
  ].some((key) => {
    const value = config[key];
    return typeof value === 'string' && value.trim() && !value.includes('{{');
  });
  // Optional-auth custom endpoints also suppress all ambient authentication.
  // An explicitly configured bearer token retains highest priority in either case.
  if (config.apiKeyRequired === false || hasExplicitAwsCredentials) {
    return explicitKey || undefined;
  }
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
