import { getDefaultPort } from '../constants';
import { startServer } from '../server/server';
import telemetry from '../telemetry';
import { setupEnv } from '../util';
import { setConfigDirectoryPath } from '../util/config/manage';
import { BrowserBehavior, checkServerRunning, openBrowser } from '../util/server';
import type { Command } from 'commander';

export function evalSetupCommand(program: Command) {
  program
    .command('setup [configDirectory]')
    .description('Start browser UI and open to eval setup')
    .option('-p, --port <number>', 'Port number', getDefaultPort().toString())
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(
      async (
        directory: string | undefined,
        cmdObj: {
          port: number;
          apiBaseUrl?: string;
          envPath?: string;
        } & Command,
      ) => {
        setupEnv(cmdObj.envPath);
        telemetry.record('eval setup', {});

        if (directory) {
          setConfigDirectoryPath(directory);
        }

        const isRunning = await checkServerRunning();
        const browserBehavior = BrowserBehavior.OPEN_TO_EVAL_SETUP;

        if (isRunning) {
          await openBrowser(browserBehavior);
        } else {
          await startServer(cmdObj.port, browserBehavior);
        }
      },
    );
}
