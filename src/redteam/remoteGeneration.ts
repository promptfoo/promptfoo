import cliState from '../cliState';
import { getEnvBool, getEnvString } from '../envars';
import { CloudConfig } from '../globalConfig/cloud';

export function getRemoteGenerationUrl(): string {
  // Check env var first
  const envUrl = getEnvString('PROMPTFOO_REMOTE_GENERATION_URL');
  if (envUrl) {
    return envUrl;
  }
  // If logged into cloud use that url + /task
  const cloudConfig = new CloudConfig();
  if (cloudConfig.isEnabled()) {
    return cloudConfig.getApiHost() + '/api/v1/task';
  }
  // otherwise use the default
  return 'https://api.promptfoo.app/api/v1/task';
}

export function neverGenerateRemote(): boolean {
  return getEnvBool('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION');
}

/**
 * Builds a remote URL with a substituted pathname, honoring env vars / cloud config.
 */
function buildRemoteUrl(pathname: string, fallback: string): string | null {
  if (neverGenerateRemote()) {
    return null;
  }

  const envUrl = getEnvString('PROMPTFOO_REMOTE_GENERATION_URL');
  if (envUrl) {
    try {
      const url = new URL(envUrl);
      url.pathname = pathname;
      return url.toString();
    } catch {
      return fallback;
    }
  }

  const cloudConfig = new CloudConfig();
  if (cloudConfig.isEnabled()) {
    return `${cloudConfig.getApiHost()}${pathname}`;
  }

  return fallback;
}

/**
 * Gets the URL for checking remote API health based on configuration.
 * @returns The health check URL, or null if remote generation is disabled.
 */
export function getRemoteHealthUrl(): string | null {
  return buildRemoteUrl('/health', 'https://api.promptfoo.app/health');
}

/**
 * Gets the URL for checking remote API version based on configuration.
 * @returns The version check URL, or null if remote generation is disabled.
 */
export function getRemoteVersionUrl(): string | null {
  return buildRemoteUrl('/version', 'https://api.promptfoo.app/version');
}

export function shouldGenerateRemote(): boolean {
  // Generate remotely when the user has not disabled it and does not have an OpenAI key.
  return (!neverGenerateRemote() && !getEnvString('OPENAI_API_KEY')) || (cliState.remote ?? false);
}

export function getRemoteGenerationUrlForUnaligned(): string {
  // Check env var first
  const envUrl = getEnvString('PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT');
  if (envUrl) {
    return envUrl;
  }
  // If logged into cloud use that url + /task
  const cloudConfig = new CloudConfig();
  if (cloudConfig.isEnabled()) {
    return cloudConfig.getApiHost() + '/api/v1/task/harmful';
  }
  // otherwise use the default
  return 'https://api.promptfoo.app/api/v1/task/harmful';
}
