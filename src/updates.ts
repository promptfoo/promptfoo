import chalk from 'chalk';
import semverGt from 'semver/functions/gt';

import packageJson from '../package.json';
import { fetchWithTimeout } from './fetch';
import logger from './logger';

const VERSION = packageJson.version;

export async function getLatestVersion() {
  const response = await fetchWithTimeout(`https://api.promptfoo.dev/api/latestVersion`, {}, 1000);
  if (!response.ok) {
    throw new Error(`Failed to fetch package information for promptfoo`);
  }
  const data = (await response.json()) as { latestVersion: string };
  return data.latestVersion;
}

export async function checkForUpdates(): Promise<boolean> {
  if (process.env.PROMPTFOO_DISABLE_UPDATE) {
    return false;
  }

  let latestVersion: string;
  try {
    latestVersion = await getLatestVersion();
  } catch {
    return false;
  }
  if (semverGt(latestVersion, VERSION)) {
    const border = '='.repeat(process.stdout.columns - 10);
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
    return true;
  }
  return false;
}
