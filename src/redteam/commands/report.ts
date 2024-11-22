import type { Command } from 'commander';
import { DEFAULT_PORT } from '../../constants';
import { BrowserBehavior, startServer } from '../../server/server';
import telemetry from '../../telemetry';
import { setupEnv } from '../../util';
import { setConfigDirectoryPath } from '../../util/config/manage';

export function redteamReportCommand(program: Command) {
  program
    .command('report [directory]')
    .description('Start browser ui and open to report')
    .option('-p, --port <number>', 'Port number', DEFAULT_PORT.toString())
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
          name: 'redteam report',
        });
        await telemetry.send();

        if (directory) {
          setConfigDirectoryPath(directory);
        }

        await startServer(cmdObj.port, BrowserBehavior.OPEN_TO_REPORT, cmdObj.filterDescription);
      },
    );
}
