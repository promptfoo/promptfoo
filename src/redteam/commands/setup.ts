import { getDefaultPort } from '../../constants.js';
import logger from '../../logger.js';
import { startServer } from '../../server/server.js';
import telemetry from '../../telemetry.js';
import { setupEnv } from '../../util/index.js';
import { setConfigDirectoryPath } from '../../util/config/manage.js';
import { BrowserBehavior, checkServerRunning, openBrowser } from '../../util/server.js';
import type { Command } from 'commander';

export function redteamSetupCommand(program: Command) {
  program
    .command('setup [configDirectory]')
    .description('Start browser UI and open to redteam setup')
    .option('-p, --port <number>', 'Port number', getDefaultPort().toString())
    .option('--filter-description <pattern>', 'Filter evals by description using a regex pattern')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(
      async (
        directory: string | undefined,
        cmdObj: {
          port: number;
          apiBaseUrl?: string;
          envPath?: string;
          filterDescription?: string;
        } & Command,
      ) => {
        setupEnv(cmdObj.envPath);
        telemetry.record('command_used', {
          name: 'redteam setup',
        });

        if (directory) {
          setConfigDirectoryPath(directory);
        }
        if (cmdObj.filterDescription) {
          logger.warn(
            'The --filter-description option is deprecated and not longer supported. The argument will be ignored.',
          );
        }

        const isRunning = await checkServerRunning();
        const browserBehavior = BrowserBehavior.OPEN_TO_REDTEAM_CREATE;

        if (isRunning) {
          await openBrowser(browserBehavior);
        } else {
          await startServer(cmdObj.port, browserBehavior);
        }
      },
    );
}
