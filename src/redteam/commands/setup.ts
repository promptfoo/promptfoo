import type { Command } from 'commander';
import { BrowserBehavior, startServer } from '../../server/server';
import telemetry from '../../telemetry';
import { setupEnv } from '../../util';
import { setConfigDirectoryPath } from '../../util/config/manage';

export function redteamSetupCommand(program: Command) {
  program
    .command('setup [configDirectory]')
    .description('Start browser ui and open to redteam setup')
    .option('-p, --port <number>', 'Port number', '15500')
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
        await telemetry.send();

        if (directory) {
          setConfigDirectoryPath(directory);
        }

        const browserBehavior = BrowserBehavior.OPEN_TO_REDTEAM_CREATE;
        await startServer(cmdObj.port, browserBehavior, cmdObj.filterDescription);
      },
    );
}
