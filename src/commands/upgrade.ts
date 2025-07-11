import chalk from 'chalk';
import { execSync } from 'child_process';
import type { Command } from 'commander';
import * as semver from 'semver';
import { VERSION } from '../constants';
import logger from '../logger';
import { execAsync } from '../python/execAsync';
import telemetry from '../telemetry';
import { getLatestVersion } from '../updates';
import { isRunningUnderNpx } from '../util';

interface UpgradeOptions {
  version?: string;
  check?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

type InstallMethod =
  | 'npm-global'
  | 'yarn-global'
  | 'pnpm-global'
  | 'homebrew'
  | 'binary'
  | 'npx'
  | 'unknown';

interface InstallInfo {
  method: InstallMethod;
  currentVersion: string;
  execPath: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm';
}

async function detectInstallMethod(): Promise<InstallInfo> {
  const execPath = process.execPath;
  const currentVersion = VERSION;

  // Check if running under npx
  if (isRunningUnderNpx()) {
    return {
      method: 'npx',
      currentVersion,
      execPath,
    };
  }

  // Check for homebrew installation
  if (execPath.includes('/Cellar/') || execPath.includes('homebrew')) {
    return {
      method: 'homebrew',
      currentVersion,
      execPath,
    };
  }

  // Check for global package manager installations
  try {
    // Check npm global
    const { stdout: npmList } = await execAsync('npm list -g promptfoo --json');
    const npmData = JSON.parse(npmList);
    if (npmData.dependencies?.promptfoo) {
      return {
        method: 'npm-global',
        currentVersion,
        execPath,
        packageManager: 'npm',
      };
    }
  } catch {
    // Not installed via npm global
  }

  try {
    // Check yarn global
    const { stdout: yarnList } = await execAsync('yarn global list --json');
    if (yarnList.includes('promptfoo')) {
      return {
        method: 'yarn-global',
        currentVersion,
        execPath,
        packageManager: 'yarn',
      };
    }
  } catch {
    // Not installed via yarn global
  }

  try {
    // Check pnpm global
    const { stdout: pnpmList } = await execAsync('pnpm list -g --json');
    const pnpmData = JSON.parse(pnpmList);
    if (pnpmData[0]?.dependencies?.promptfoo || pnpmData[0]?.devDependencies?.promptfoo) {
      return {
        method: 'pnpm-global',
        currentVersion,
        execPath,
        packageManager: 'pnpm',
      };
    }
  } catch {
    // Not installed via pnpm global
  }

  // Check if it's a binary installation
  const promptfooPath = process.argv[1];
  if (promptfooPath && !promptfooPath.includes('node_modules')) {
    // Likely a standalone binary
    return {
      method: 'binary',
      currentVersion,
      execPath,
    };
  }

  return {
    method: 'unknown',
    currentVersion,
    execPath,
  };
}

async function checkForUpdates(targetVersion?: string): Promise<{
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  targetVersion?: string;
}> {
  const currentVersion = VERSION;

  let latestVersion: string;
  if (targetVersion) {
    // Verify the target version exists
    try {
      const { stdout } = await execAsync(`npm view promptfoo@${targetVersion} version`);
      latestVersion = stdout.trim();
    } catch {
      throw new Error(`Version ${targetVersion} not found in npm registry`);
    }
  } else {
    // Get latest version
    latestVersion = await getLatestVersion();
  }

  const updateAvailable = targetVersion
    ? currentVersion !== targetVersion
    : semver.gt(latestVersion, currentVersion);

  return {
    currentVersion,
    latestVersion,
    updateAvailable,
    targetVersion,
  };
}

async function performUpgrade(
  installInfo: InstallInfo,
  targetVersion?: string,
  dryRun?: boolean,
): Promise<void> {
  const version = targetVersion || 'latest';
  let command: string;

  switch (installInfo.method) {
    case 'npm-global':
      command = `npm install -g promptfoo@${version}`;
      break;

    case 'yarn-global':
      command = `yarn global add promptfoo@${version}`;
      break;

    case 'pnpm-global':
      command = `pnpm add -g promptfoo@${version}`;
      break;

    case 'homebrew':
      if (targetVersion && targetVersion !== 'latest') {
        throw new Error(
          'Homebrew does not support installing specific versions. Use --force to upgrade to the latest version.',
        );
      }
      command = 'brew upgrade promptfoo';
      break;

    case 'npx':
      logger.info(chalk.yellow('You are running promptfoo via npx.'));
      logger.info(chalk.cyan(`To use a specific version, run: npx promptfoo@${version}`));
      logger.info(chalk.cyan(`To always use the latest version, run: npx promptfoo@latest`));
      return;

    case 'binary':
      throw new Error(
        'Binary installations cannot be upgraded automatically. Please download the latest version from https://github.com/promptfoo/promptfoo/releases',
      );

    default:
      throw new Error('Could not detect installation method. Please upgrade manually.');
  }

  if (dryRun) {
    logger.info(chalk.blue('Dry run mode - would execute:'));
    logger.info(chalk.cyan(command));
    return;
  }

  logger.info(chalk.blue(`Upgrading promptfoo using: ${command}`));

  try {
    // Show real-time output
    execSync(command, { stdio: 'inherit' });

    // Verify the upgrade
    const { stdout: newVersionOutput } = await execAsync('promptfoo --version');
    const newVersion = newVersionOutput.trim();

    logger.info(chalk.green(`✅ Successfully upgraded to version ${newVersion}`));
  } catch (error) {
    logger.error(chalk.red('Failed to upgrade promptfoo'));
    if (error instanceof Error) {
      logger.error(error.message);
    }
    throw error;
  }
}

export function upgradeCommand(program: Command) {
  program
    .command('upgrade')
    .description('Upgrade promptfoo to the latest version or a specific version')
    .option('--version <version>', 'Upgrade to a specific version')
    .option('--check', 'Check for updates without upgrading')
    .option('--force', 'Force upgrade even if already on the target version')
    .option('--dry-run', 'Show what would be done without actually upgrading')
    .action(async (options: UpgradeOptions) => {
      telemetry.record('command_used', { name: 'upgrade' });

      try {
        // Detect installation method
        const installInfo = await detectInstallMethod();
        logger.debug(`Detected installation method: ${installInfo.method}`);

        if (options.check) {
          // Just check for updates
          const updateInfo = await checkForUpdates(options.version);

          if (updateInfo.updateAvailable) {
            logger.info(
              chalk.yellow(
                `Update available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}`,
              ),
            );

            const command =
              installInfo.method === 'npx' ? 'npx promptfoo@latest' : 'promptfoo upgrade';
            logger.info(chalk.cyan(`Run ${chalk.bold(command)} to upgrade`));
          } else {
            logger.info(
              chalk.green(`You are on the latest version (${updateInfo.currentVersion})`),
            );
          }
          return;
        }

        // Check for updates
        const updateInfo = await checkForUpdates(options.version);

        if (!updateInfo.updateAvailable && !options.force) {
          logger.info(chalk.green(`You are already on version ${updateInfo.currentVersion}`));
          if (options.version) {
            logger.info(
              chalk.yellow(`Target version ${options.version} is the same as current version`),
            );
          } else {
            logger.info(chalk.yellow('Use --force to reinstall'));
          }
          return;
        }

        // Show update information
        if (updateInfo.updateAvailable) {
          logger.info(
            chalk.yellow(
              `Update available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}`,
            ),
          );
        } else {
          logger.info(chalk.yellow(`Forcing reinstall of version ${updateInfo.currentVersion}`));
        }

        // Perform upgrade
        await performUpgrade(installInfo, options.version, options.dryRun);

        telemetry.record('command_used', {
          name: 'upgrade:completed',
          from_version: updateInfo.currentVersion,
          to_version: updateInfo.latestVersion,
          install_method: installInfo.method,
          forced: options.force || false,
        });
      } catch (error) {
        telemetry.record('command_used', {
          name: 'upgrade:failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        logger.error(chalk.red('Upgrade failed:'));
        if (error instanceof Error) {
          logger.error(error.message);
        } else {
          logger.error(String(error));
        }
        process.exitCode = 1;
      }
    });
}
