import chalk from 'chalk';
import opener from 'opener';
import { getDefaultPort, VERSION } from '../constants';
import logger from '../logger';
import { getRemoteVersionUrl } from '../redteam/remoteGeneration';
import { fetchWithProxy } from './fetch/index';
import { promptYesNo } from './readline';

export const BrowserBehavior = {
  ASK: 0,
  OPEN: 1,
  SKIP: 2,
  OPEN_TO_REPORT: 3,
  OPEN_TO_REDTEAM_CREATE: 4,
} as const;
export type BrowserBehavior = (typeof BrowserBehavior)[keyof typeof BrowserBehavior];

// Reverse lookup for BrowserBehavior names
export const BrowserBehaviorNames: Record<BrowserBehavior, string> = {
  [BrowserBehavior.ASK]: 'ASK',
  [BrowserBehavior.OPEN]: 'OPEN',
  [BrowserBehavior.SKIP]: 'SKIP',
  [BrowserBehavior.OPEN_TO_REPORT]: 'OPEN_TO_REPORT',
  [BrowserBehavior.OPEN_TO_REDTEAM_CREATE]: 'OPEN_TO_REDTEAM_CREATE',
};

// Cache for feature detection results to avoid repeated version checks
const featureCache = new Map<string, boolean>();

/**
 * Clears the feature detection cache - used for testing
 * @internal
 */
export function __clearFeatureCache(): void {
  featureCache.clear();
}

/**
 * Checks if a server supports a specific feature based on build date
 * @param featureName - Name of the feature (for caching and logging)
 * @param requiredBuildDate - Minimum build date when feature was added (ISO string)
 * @returns Promise<boolean> - true if server supports the feature
 */
export async function checkServerFeatureSupport(
  featureName: string,
  requiredBuildDate: string,
): Promise<boolean> {
  const cacheKey = `${featureName}`;

  // Return cached result if available
  if (featureCache.has(cacheKey)) {
    return featureCache.get(cacheKey)!;
  }

  let supported = false;

  try {
    logger.debug(`[Feature Detection] Checking server support for feature: ${featureName}`);

    const versionUrl = getRemoteVersionUrl();

    if (versionUrl) {
      const response = await fetchWithProxy(versionUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (data.buildDate) {
        // Parse build date and check if it's after the required date
        const buildDate = new Date(data.buildDate);
        const featureDate = new Date(requiredBuildDate);
        supported = buildDate >= featureDate;
        logger.debug(
          `[Feature Detection] ${featureName}: buildDate=${data.buildDate}, required=${requiredBuildDate}, supported=${supported}`,
        );
      } else {
        logger.debug(`[Feature Detection] ${featureName}: no version info, assuming not supported`);
        supported = false;
      }
    } else {
      logger.debug(
        `[Feature Detection] No remote URL available for ${featureName}, assuming local server supports it`,
      );
      supported = true;
    }
  } catch (error) {
    logger.debug(
      `[Feature Detection] Version check failed for ${featureName}, assuming not supported: ${error}`,
    );
    supported = false;
  }

  // Cache the result
  featureCache.set(cacheKey, supported);
  return supported;
}

export async function checkServerRunning(port = getDefaultPort()): Promise<boolean> {
  logger.debug(`Checking for existing server on port ${port}...`);
  try {
    const response = await fetchWithProxy(`http://localhost:${port}/health`, {
      headers: {
        'x-promptfoo-silent': 'true',
      },
    });
    const data = await response.json();
    return data.status === 'OK' && data.version === VERSION;
  } catch (err) {
    logger.debug(`No existing server found - this is expected on first startup. ${String(err)}`);
    return false;
  }
}

export async function openBrowser(
  browserBehavior: BrowserBehavior,
  port = getDefaultPort(),
): Promise<void> {
  const baseUrl = `http://localhost:${port}`;
  let url = baseUrl;
  if (browserBehavior === BrowserBehavior.OPEN_TO_REPORT) {
    url = `${baseUrl}/report`;
  } else if (browserBehavior === BrowserBehavior.OPEN_TO_REDTEAM_CREATE) {
    url = `${baseUrl}/redteam/setup`;
  }

  const doOpen = async () => {
    try {
      logger.info('Press Ctrl+C to stop the server');
      await opener(url);
    } catch (err) {
      logger.error(`Failed to open browser: ${String(err)}`);
    }
  };

  if (browserBehavior === BrowserBehavior.ASK) {
    const shouldOpen = await promptYesNo('Open URL in browser?', false);
    if (shouldOpen) {
      await doOpen();
    }
  } else if (browserBehavior !== BrowserBehavior.SKIP) {
    await doOpen();
  }
}

/**
 * Opens authentication URLs in the browser with environment-aware behavior.
 *
 * @param authUrl - The login/signup URL to open in the browser
 * @param welcomeUrl - The URL where users can get their API token after login
 * @param browserBehavior - Controls how the browser opening is handled:
 *   - BrowserBehavior.ASK: Prompts user before opening (defaults to yes)
 *   - BrowserBehavior.OPEN: Opens browser automatically without prompting
 *   - BrowserBehavior.SKIP: Shows manual URLs without opening browser
 * @returns Promise that resolves when the operation completes
 *
 * @example
 * ```typescript
 * // Prompt user to open login page
 * await openAuthBrowser(
 *   'https://promptfoo.app',
 *   'https://promptfoo.app/welcome',
 *   BrowserBehavior.ASK
 * );
 * ```
 */
export async function openAuthBrowser(
  authUrl: string,
  welcomeUrl: string,
  browserBehavior: BrowserBehavior,
): Promise<void> {
  const doOpen = async () => {
    try {
      logger.info(`Opening ${authUrl} in your browser...`);
      await opener(authUrl);
      logger.info(`After logging in, get your API token at ${chalk.green(welcomeUrl)}`);
    } catch (err) {
      logger.error(`Failed to open browser: ${String(err)}`);
      // Fallback to showing URLs manually
      logger.info(`Please visit: ${chalk.green(authUrl)}`);
      logger.info(`After logging in, get your API token at ${chalk.green(welcomeUrl)}`);
    }
  };

  if (browserBehavior === BrowserBehavior.ASK) {
    const shouldOpen = await promptYesNo('Open login page in browser?', true);
    if (shouldOpen) {
      await doOpen();
    } else {
      logger.info(`Please visit: ${chalk.green(authUrl)}`);
      logger.info(`After logging in, get your API token at ${chalk.green(welcomeUrl)}`);
    }
  } else if (browserBehavior === BrowserBehavior.SKIP) {
    logger.info(`Please visit: ${chalk.green(authUrl)}`);
    logger.info(`After logging in, get your API token at ${chalk.green(welcomeUrl)}`);
  } else {
    await doOpen();
  }
}
