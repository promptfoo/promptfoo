import { getDefaultPort } from '../../constants';
import logger from '../../logger';
import { startServer } from '../../server/server';
import telemetry from '../../telemetry';
import { setConfigDirectoryPath } from '../../util/config/manage';
import { setupEnv } from '../../util/index';
import { type BrowserBehavior, checkServerRunning, openBrowser } from '../../util/server';
import type { Command } from 'commander';

type RedteamBrowserCommandConfig = {
  command: string;
  description: string;
  telemetryEvent: 'redteam report' | 'redteam setup';
  browserBehavior: BrowserBehavior;
};

export function registerRedteamBrowserCommand(
  program: Command,
  config: RedteamBrowserCommandConfig,
) {
  program
    .command(config.command)
    .description(config.description)
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
        telemetry.record(config.telemetryEvent, {});

        if (directory) {
          setConfigDirectoryPath(directory);
        }
        if (cmdObj.filterDescription) {
          logger.warn(
            'The --filter-description option is deprecated and not longer supported. The argument will be ignored.',
          );
        }

        const isRunning = await checkServerRunning();
        if (isRunning) {
          await openBrowser(config.browserBehavior);
        } else {
          await startServer(cmdObj.port, config.browserBehavior);
        }
      },
    );
}
