import type { Command } from 'commander';
import { BrowserBehavior, startServer } from '../server/server';
import telemetry from '../telemetry';
import { setupEnv } from '../util';
import { setConfigDirectoryPath } from '../util/config/manage';

export function viewCommand(program: Command) {
  program
    .command('view [directory]')
    .description('Start browser ui')
    .option('-p, --port <number>', 'Port number', '15500')
    .option('-y, --yes', 'Skip confirmation and auto-open the URL')
    .option('-n, --no', 'Skip confirmation and do not open the URL')
    .option('--filter-description <pattern>', 'Filter evals by description using a regex pattern')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(
      async (
        directory: string | undefined,
        cmdObj: {
          port: number;
          yes: boolean;
          no: boolean;
          apiBaseUrl?: string;
          envPath?: string;
          filterDescription?: string;
        } & Command,
      ) => {
        setupEnv(cmdObj.envPath);
        telemetry.record('command_used', {
          name: 'view',
        });
        await telemetry.send();

        if (directory) {
          setConfigDirectoryPath(directory);
        }
        // Block indefinitely on server
        const browserBehavior = cmdObj.yes
          ? BrowserBehavior.OPEN
          : cmdObj.no
            ? BrowserBehavior.SKIP
            : BrowserBehavior.ASK;
        await startServer(cmdObj.port, browserBehavior, cmdObj.filterDescription);
      },
    );
}
