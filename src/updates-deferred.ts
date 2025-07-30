import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import semverGt from 'semver/functions/gt';
import { TERMINAL_MAX_WIDTH, VERSION } from './constants';
import { getEnvBool } from './envars';
import { fetchWithTimeout } from './fetch';
import logger from './logger';

const UPDATE_CACHE_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.promptfoo-update-check'
);

interface UpdateCache {
  lastCheck: number;
  latestVersion?: string;
  hasUpdate: boolean;
}

function readUpdateCache(): UpdateCache | null {
  try {
    const data = fs.readFileSync(UPDATE_CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function writeUpdateCache(cache: UpdateCache): void {
  try {
    fs.writeFileSync(UPDATE_CACHE_FILE, JSON.stringify(cache));
  } catch {
    // Ignore cache write failures
  }
}

export async function getLatestVersion() {
  const response = await fetchWithTimeout(`https://api.promptfoo.dev/api/latestVersion`, {}, 1000);
  if (!response.ok) {
    throw new Error(`Failed to fetch package information for promptfoo`);
  }
  const data = (await response.json()) as { latestVersion: string };
  return data.latestVersion;
}

/**
 * Check for updates with caching and non-blocking behavior
 * @param options Configuration options
 * @returns Promise that resolves when check is complete (can be ignored)
 */
export async function checkForUpdatesDeferred(options: {
  force?: boolean;
  cacheTTL?: number;
} = {}): Promise<void> {
  if (getEnvBool('PROMPTFOO_DISABLE_UPDATE')) {
    return;
  }

  const { force = false, cacheTTL = 24 * 60 * 60 * 1000 } = options; // Default 24 hours

  // Check cache first
  if (!force) {
    const cache = readUpdateCache();
    if (cache && (Date.now() - cache.lastCheck) < cacheTTL) {
      // Use cached result
      if (cache.hasUpdate && cache.latestVersion) {
        showUpdateMessage(cache.latestVersion);
      }
      return;
    }
  }

  // Perform the check
  try {
    const latestVersion = await getLatestVersion();
    const hasUpdate = semverGt(latestVersion, VERSION);
    
    // Update cache
    writeUpdateCache({
      lastCheck: Date.now(),
      latestVersion: hasUpdate ? latestVersion : undefined,
      hasUpdate
    });

    if (hasUpdate) {
      showUpdateMessage(latestVersion);
    }
  } catch {
    // Silently ignore update check failures
  }
}

function showUpdateMessage(latestVersion: string): void {
  const border = '='.repeat(TERMINAL_MAX_WIDTH);
  logger.info(
    `\n${border}
${chalk.yellow('⚠️')} The current version of promptfoo ${chalk.yellow(
      VERSION,
    )} is lower than the latest available version ${chalk.green(latestVersion)}.

Please run ${chalk.green('npx promptfoo@latest')} or ${chalk.green(
      'npm install -g promptfoo@latest',
    )} to update.
${border}\n`,
  );
}

// Original synchronous function for backwards compatibility
export { checkForUpdates } from './updates';