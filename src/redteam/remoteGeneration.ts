import cliState from '../cliState';
import { getEnvBool, getEnvString } from '../envars';
import { isLoggedIntoCloud } from '../globalConfig/accounts';
import { CloudConfig } from '../globalConfig/cloud';

/**
 * Gets the remote generation API endpoint URL.
 * Prioritizes: env var > cloud config > default endpoint.
 * @returns The remote generation URL
 */
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

/**
 * Check if remote generation should never be used.
 * Respects both the general and redteam-specific disable flags.
 * @returns true if remote generation is disabled
 */
export function neverGenerateRemote(): boolean {
  // Check the general disable flag first (superset)
  if (getEnvBool('PROMPTFOO_DISABLE_REMOTE_GENERATION')) {
    return true;
  }
  // Fall back to the redteam-specific flag (subset)
  return getEnvBool('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION');
}

/**
 * Check if remote generation should never be used for non-redteam features.
 * This allows granular control: disable redteam remote generation while allowing
 * regular SimulatedUser to use remote generation.
 * @returns true if ALL remote generation is disabled
 */
export function neverGenerateRemoteForRegularEvals(): boolean {
  // Only respect the general disable flag for non-redteam features
  return getEnvBool('PROMPTFOO_DISABLE_REMOTE_GENERATION');
}

/**
 * Builds a remote URL with a substituted pathname, honoring env vars / cloud config.
 */
export function buildRemoteUrl(pathname: string, fallback: string): string | null {
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

/**
 * Returns a standardized error message for strategies that require remote generation
 * but `shouldGenerateRemote()` returned false (e.g. OPENAI_API_KEY is set without cloud login).
 * Callers should use this when checking `!shouldGenerateRemote()`.
 * @param strategyName - The name of the strategy requiring remote generation
 * @returns A human-readable error message with remediation steps
 */
export function getRemoteGenerationDisabledError(strategyName: string): string {
  return (
    `${strategyName} requires remote generation, which is currently disabled for this configuration. ` +
    `To enable it: run with the --remote flag (e.g., promptfoo redteam run --remote), ` +
    `set PROMPTFOO_REMOTE_GENERATION_URL to a self-hosted endpoint, ` +
    `or log into Promptfoo Cloud (promptfoo auth login).`
  );
}

/**
 * Returns a standardized error message for strategies that require remote generation
 * but it has been explicitly disabled via PROMPTFOO_DISABLE_REMOTE_GENERATION or
 * PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION.
 * Callers should use this when checking `neverGenerateRemote()`.
 * @param strategyName - The name of the strategy requiring remote generation
 * @returns A human-readable error message with remediation steps
 */
export function getRemoteGenerationExplicitlyDisabledError(strategyName: string): string {
  return (
    `${strategyName} requires remote generation, which has been explicitly disabled. ` +
    `To enable it: unset PROMPTFOO_DISABLE_REMOTE_GENERATION and PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION, ` +
    `then set PROMPTFOO_REMOTE_GENERATION_URL to a self-hosted endpoint or log into Promptfoo Cloud (promptfoo auth login).`
  );
}

/**
 * Determines if remote generation should be used based on configuration.
 * @returns true if remote generation should be used
 */
export function shouldGenerateRemote(): boolean {
  // If remote generation is explicitly disabled, respect that even for cloud users
  if (neverGenerateRemote()) {
    return false;
  }

  // If logged into cloud, prefer remote generation
  if (isLoggedIntoCloud()) {
    return true;
  }

  // Generate remotely when the user has not disabled it and does not have an OpenAI key.
  return !getEnvString('OPENAI_API_KEY') || (cliState.remote ?? false);
}

/**
 * Gets the URL for unaligned model inference (harmful content generation).
 * Prioritizes: env var > cloud config > default endpoint.
 * @returns The unaligned inference URL
 */
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
