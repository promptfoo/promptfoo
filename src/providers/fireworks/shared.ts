import { getEnvString } from '../../envars';

import type { EnvVarKey } from '../../envars';
import type { EnvOverrides } from '../../types/env';

export const FIREWORKS_API_BASE_URL = 'https://api.fireworks.ai/inference/v1';

export const DEFAULT_FIREWORKS_API_KEY_ENVAR = 'FIREWORKS_API_KEY';

// The subset of OpenAI-compatible config that the Fireworks credential helpers
// read. Both the chat and embedding providers share these fields.
type FireworksCredentialConfig =
  | {
      apiKey?: string;
      apiKeyEnvar?: string;
      apiHost?: string;
      apiBaseUrl?: string;
    }
  | undefined;

// Resolve the Fireworks base URL the provider should target. Falls back to an
// explicit `FIREWORKS_API_BASE_URL` (provider-level env override or process
// env) before the public endpoint, but — unlike the OpenAI base class — never
// consults OPENAI_API_HOST / OPENAI_API_BASE_URL / OPENAI_BASE_URL so an
// environment configured for OpenAI can't silently reroute Fireworks traffic.
export function resolveFireworksApiBaseUrl(
  explicitBaseUrl: string | undefined,
  env: EnvOverrides | undefined,
): string {
  const envBaseUrl =
    (env as Record<string, string | undefined> | undefined)?.FIREWORKS_API_BASE_URL ||
    getEnvString('FIREWORKS_API_BASE_URL');
  return explicitBaseUrl || envBaseUrl || FIREWORKS_API_BASE_URL;
}

// Build the config the Fireworks providers hand to their OpenAI-compatible base
// class: the caller's config plus the resolved base URL and the Fireworks API
// key envar (so a missing key surfaces a Fireworks-specific error).
export function buildFireworksProviderConfig<T extends FireworksCredentialConfig>(
  config: T,
  env: EnvOverrides | undefined,
): T & { apiBaseUrl: string; apiKeyEnvar: string } {
  return {
    ...config,
    apiBaseUrl: resolveFireworksApiBaseUrl(config?.apiBaseUrl, env),
    apiKeyEnvar: config?.apiKeyEnvar || DEFAULT_FIREWORKS_API_KEY_ENVAR,
  } as T & { apiBaseUrl: string; apiKeyEnvar: string };
}

// Resolve the Fireworks API key without ever falling back to OPENAI_API_KEY: a
// misconfigured environment must fail loudly rather than ship an OpenAI key to
// api.fireworks.ai.
export function resolveFireworksApiKey(
  config: FireworksCredentialConfig,
  env: EnvOverrides | undefined,
): string | undefined {
  const envar = config?.apiKeyEnvar || DEFAULT_FIREWORKS_API_KEY_ENVAR;
  return config?.apiKey || env?.[envar as keyof EnvOverrides] || getEnvString(envar as EnvVarKey);
}

// Resolve the request URL. The OpenAI base class consults OPENAI_API_HOST /
// OPENAI_API_BASE_URL / OPENAI_BASE_URL before config.apiBaseUrl, which would
// let an OpenAI-targeted environment silently reroute fireworks:* requests. We
// still honor an explicitly configured `apiHost` so users wiring a Fireworks
// proxy or gateway through config keep working.
export function resolveFireworksApiUrl(config: FireworksCredentialConfig): string {
  if (config?.apiHost) {
    return `https://${config.apiHost}/v1`;
  }
  return config?.apiBaseUrl || FIREWORKS_API_BASE_URL;
}
