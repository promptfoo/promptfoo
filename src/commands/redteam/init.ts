import { AbortPromptError, ExitPromptError } from '@inquirer/core';
import chalk from 'chalk';
import { getDefaultPort } from '../../constants';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { redteamInit } from '../../redteam/commands/init';
import { startServer } from '../../server/server';
import telemetry from '../../telemetry';
import { setupEnv } from '../../util/index';
import { promptfooCommand } from '../../util/promptfooCommand';
import { BrowserBehavior, checkServerRunning, openBrowser } from '../../util/server';
import type { Command } from 'commander';

/**
 * Registers the `redteam init` CLI command. Lives in the cli layer (rather than
 * with the redteamInit flow in src/redteam) because it launches the web UI via
 * startServer — keeping the redteam layer free of a view-server dependency.
 */
export function initCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Initialize red teaming project')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('--no-gui', 'Do not open the browser UI')
    .action(
      async (
        directory: string | undefined,
        opts: { envPath: string | undefined; gui: boolean },
      ) => {
        setupEnv(opts.envPath);
        try {
          // Check if we're in a non-GUI environment
          const isGUI =
            getEnvString('DISPLAY') ||
            process.platform === 'win32' ||
            process.platform === 'darwin';
          const useGui = opts.gui && isGUI;

          if (useGui) {
            const isRunning = await checkServerRunning();

            if (isRunning) {
              await openBrowser(BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
            } else {
              await startServer(getDefaultPort(), BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
            }
          } else {
            await redteamInit(directory);
          }
        } catch (err) {
          if (err instanceof AbortPromptError || err instanceof ExitPromptError) {
            logger.info(
              '\n' +
                chalk.blue(
                  'Red team initialization paused. To continue setup later, use the command: ',
                ) +
                chalk.bold(promptfooCommand('redteam init')),
            );
            logger.info(
              chalk.blue('For help or feedback, visit ') +
                chalk.green('https://www.promptfoo.dev/contact/'),
            );
            telemetry.record('funnel', { type: 'redteam onboarding', step: 'early exit' });
            process.exitCode = 130;
            return;
          } else {
            throw err;
          }
        }
      },
    );
}
