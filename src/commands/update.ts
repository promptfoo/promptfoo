import chalk from 'chalk';
import { execSync } from 'child_process';
import type { Command } from 'commander';
import dedent from 'dedent';
import fs from 'fs';
import ora from 'ora';
import os from 'os';
import path from 'path';
import { VERSION } from '../constants';
import logger from '../logger';
import { getLatestVersion } from '../updates';
import { isRunningUnderNpx } from '../util';

// Add backup functionality
async function backupCurrentInstallation(): Promise<string> {
  const backupDir = path.join(os.tmpdir(), `promptfoo-backup-${VERSION}`);
  const binPath = process.argv[1];
  const backupPath = path.join(backupDir, 'promptfoo');

  try {
    // Create backup directory
    fs.mkdirSync(backupDir, { recursive: true });

    // Copy current installation
    fs.copyFileSync(binPath, backupPath);
    fs.chmodSync(backupPath, 0o755); // Make executable

    return backupDir;
  } catch (err) {
    logger.debug('Failed to create backup:', err);
    throw new Error('Failed to backup current installation');
  }
}

// Add restore functionality
async function restoreFromBackup(backupDir: string): Promise<void> {
  const binPath = process.argv[1];
  const backupPath = path.join(backupDir, 'promptfoo');

  try {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, binPath);
      fs.chmodSync(binPath, 0o755); // Make executable
      logger.info(chalk.green('Successfully rolled back to previous version'));
    }
  } catch (err) {
    logger.error('Failed to restore from backup:', err);
    throw new Error('Failed to restore from backup');
  }
}

export async function detectInstallMethod(): Promise<'npm' | 'homebrew' | 'npx' | 'unknown'> {
  if (isRunningUnderNpx()) {
    return 'npx';
  }

  if (process.platform === 'win32') {
    try {
      // On Windows, check if installed via npm by looking at the installation path
      const npmList = execSync('npm list -g promptfoo', { encoding: 'utf8' });
      if (npmList.includes('promptfoo')) {
        return 'npm';
      }
    } catch {}
  } else {
    try {
      // Check if installed via homebrew (macOS/Linux only)
      const brewList = execSync('brew list promptfoo 2>/dev/null', { encoding: 'utf8' });
      if (brewList.includes('promptfoo')) {
        return 'homebrew';
      }
    } catch {}

    try {
      // Check if installed via npm global
      const npmList = execSync('npm list -g promptfoo', { encoding: 'utf8' });
      if (npmList.includes('promptfoo')) {
        return 'npm';
      }
    } catch {}
  }

  return 'unknown';
}

export async function updateCommand(program: Command) {
  program
    .command('update')
    .description('Update promptfoo to the latest version')
    .action(async () => {
      const spinner = ora('Checking for updates...').start();
      let backupDir: string | undefined;

      try {
        const latestVersion = await getLatestVersion();

        // Add friendly message about the duplicate notification
        spinner.info(
          chalk.dim(
            "Note: You can ignore the update notification above - we're handling the update now.",
          ),
        );
        spinner.start();

        spinner.info(`Current version: ${VERSION}`);
        spinner.info(`Latest version: ${latestVersion}`);

        if (latestVersion === VERSION) {
          spinner.succeed('You are already running the latest version!');
          return;
        }

        const installMethod = await detectInstallMethod();

        // Create backup before updating
        try {
          spinner.start('Creating backup...');
          backupDir = await backupCurrentInstallation();
          spinner.succeed('Backup created');
        } catch (err) {
          spinner.fail('Failed to create backup');
          throw err;
        }

        switch (installMethod) {
          case 'npx':
            spinner.info(
              chalk.yellow(
                'You are running promptfoo via npx which always uses the latest version.',
              ),
            );
            spinner.info('To update, simply run promptfoo again using npx.');
            break;

          case 'homebrew':
            spinner.start('Updating via Homebrew...');
            try {
              execSync('brew upgrade promptfoo', { stdio: 'pipe' });
              spinner.succeed('Update successful!');
            } catch (err) {
              spinner.fail('Failed to update via Homebrew');
              logger.error(
                'Failed to update via Homebrew. Please try manually: brew upgrade promptfoo',
              );
              throw err;
            }
            break;

          case 'npm':
            spinner.start('Updating via npm...');
            try {
              execSync('npm install -g promptfoo@latest', { stdio: 'pipe' });
              spinner.succeed('Update successful!');
            } catch (err) {
              spinner.fail('Failed to update via npm');
              logger.error(
                'Failed to update via npm. Please try manually: npm install -g promptfoo@latest',
              );
              throw err;
            }
            break;

          default:
            spinner.warn('Could not determine installation method');
            logger.info(dedent`
              Please update manually using one of:
                npm install -g promptfoo@latest
                brew upgrade promptfoo
            `);
            break;
        }

        // Clean up backup after successful update
        if (backupDir) {
          try {
            fs.rmSync(backupDir, { recursive: true, force: true });
          } catch (err) {
            logger.debug('Failed to clean up backup:', err);
          }
        }
      } catch (err) {
        spinner.fail('Update failed');
        logger.error('Error details:', err);

        // Attempt rollback if we have a backup
        if (backupDir) {
          spinner.start('Rolling back to previous version...');
          try {
            await restoreFromBackup(backupDir);
            spinner.succeed('Successfully rolled back to previous version');
          } catch (rollbackErr) {
            spinner.fail('Failed to roll back');
            logger.error('Rollback error:', rollbackErr);
          }
        }

        process.exit(1);
      }
    });
}
