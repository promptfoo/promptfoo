import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import semverGt from 'semver/functions/gt';
import { TERMINAL_MAX_WIDTH, VERSION } from './constants';
import { getEnvBool } from './envars';
import { fetchWithTimeout } from './fetch';
import logger from './logger';

const execAsync = promisify(exec);

export async function getLatestVersion() {
  const response = await fetchWithTimeout(`https://api.promptfoo.dev/api/latestVersion`, {}, 1000);
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
    const response = await fetchWithTimeout('https://pypi.org/pypi/modelaudit/json', {}, 1000);
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
    const { stdout } = await execAsync('pip show modelaudit');
    const versionMatch = stdout.match(/Version:\s*(\S+)/);
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
