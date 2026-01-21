import { exec } from 'child_process';
import { promisify } from 'util';

import chalk from 'chalk';
import semverGt from 'semver/functions/gt.js';
import { TERMINAL_MAX_WIDTH, VERSION } from './constants';
import { getEnvBool } from './envars';
import logger from './logger';
import { fetchWithTimeout } from './util/fetch/index';

const execAsync = promisify(exec);

export async function getLatestVersion() {
  const response = await fetchWithTimeout(
    `https://api.promptfoo.dev/api/latestVersion`,
    {
      headers: { 'x-promptfoo-silent': 'true' },
    },
    10000,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch package information for promptfoo`);
  }
  const data = (await response.json()) as { latestVersion: string };
  return data.latestVersion;
}

export async function checkForUpdates(): Promise<boolean> {
  if (getEnvBool('PROMPTFOO_DISABLE_UPDATE')) {
    return false;
  }

  let latestVersion: string;
  try {
    latestVersion = await getLatestVersion();
  } catch {
    return false;
  }
  if (semverGt(latestVersion, VERSION)) {
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
    return true;
  }
  return false;
}

export async function getModelAuditLatestVersion(): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(
      'https://pypi.org/pypi/modelaudit/json',
      {
        headers: { 'x-promptfoo-silent': 'true' },
      },
      10000,
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { info: { version: string } };
    return data.info.version;
  } catch {
    return null;
  }
}

export async function getModelAuditCurrentVersion(): Promise<string | null> {
  try {
    // Check the actual binary version (works with pip, pipx, or any installation method)
    const { stdout } = await execAsync('modelaudit --version');
    const versionMatch = stdout.match(/modelaudit,?\s+version\s+(\S+)/i);
    return versionMatch ? versionMatch[1] : null;
  } catch {
    return null;
  }
}

export async function checkModelAuditUpdates(): Promise<boolean> {
  if (getEnvBool('PROMPTFOO_DISABLE_UPDATE')) {
    return false;
  }

  const [currentVersion, latestVersion] = await Promise.all([
    getModelAuditCurrentVersion(),
    getModelAuditLatestVersion(),
  ]);

  if (!currentVersion || !latestVersion) {
    return false;
  }

  if (semverGt(latestVersion, currentVersion)) {
    const border = '='.repeat(TERMINAL_MAX_WIDTH);
    logger.info(
      `\n${border}
${chalk.yellow('⚠️')} The current version of modelaudit ${chalk.yellow(
        currentVersion,
      )} is lower than the latest available version ${chalk.green(latestVersion)}.

Please run ${chalk.green('pip install --upgrade modelaudit')} to update.
${border}\n`,
    );
    return true;
  }
  return false;
}
