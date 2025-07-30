import chalk from 'chalk';
import semverGt from 'semver/functions/gt';
import { TERMINAL_MAX_WIDTH, VERSION } from './constants';
import { getEnvBool } from './envars';
import { fetchWithTimeout } from './fetch';
import logger from './logger';

export async function getLatestVersion() {
  const response = await fetchWithTimeout(`https://api.promptfoo.dev/api/latestVersion`, {}, 1000);
  if (!response.ok) {
    throw new Error(`Failed to fetch package information for promptfoo`);
  }
  const data = (await response.json()) as { latestVersion: string };
  return data.latestVersion;
}

/**
 * Check for updates with non-blocking behavior (no caching)
 * @returns Promise that resolves when check is complete (can be ignored)
 */
export async function checkForUpdatesDeferred(): Promise<void> {
  if (getEnvBool('PROMPTFOO_DISABLE_UPDATE')) {
    return;
  }

  // Perform the check
  try {
    const latestVersion = await getLatestVersion();
    const hasUpdate = semverGt(latestVersion, VERSION);
    
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