import opener from 'opener';
import { fetchWithCache } from '../cache';
import { getDefaultPort, VERSION } from '../constants';
import logger from '../logger';
import { getRemoteVersionUrl } from '../redteam/remoteGeneration';
import { promptYesNo } from './readline';

export enum BrowserBehavior {
  ASK = 0,
  OPEN = 1,
  SKIP = 2,
  OPEN_TO_REPORT = 3,
  OPEN_TO_REDTEAM_CREATE = 4,
}

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
      const { data } = await fetchWithCache(
        versionUrl,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
        5000,
      );

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
  try {
    const response = await fetch(`http://localhost:${port}/health`);
    const data = await response.json();
    return data.status === 'OK' && data.version === VERSION;
  } catch (err) {
    logger.debug(`Failed to check server health: ${String(err)}`);
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
