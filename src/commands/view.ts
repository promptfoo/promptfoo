import { getDefaultPort } from '../constants';
import logger from '../logger';
import { startServer } from '../server/server';
import { setConfigDirectoryPath } from '../util/config/manage';
import { setupEnv } from '../util/index';
import { BrowserBehavior } from '../util/server';
import type { Command } from 'commander';

export function viewCommand(program: Command) {
  program
    .command('view [directory]')
    .description('Start browser UI')
    .option(
      '-p, --port <number>',
      'Port number',
      (val) => Number.parseInt(val, 10),
      getDefaultPort(),
    )
    .option('-y, --yes', 'Skip confirmation and auto-open the URL')
    .option('-n, --no', 'Skip confirmation and do not open the URL')
    .option('--filter-description <pattern>', 'Filter evals by description using a regex pattern')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('--id <evalId>', 'Open the browser directly to a specific eval')
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
          id?: string;
        } & Command,
      ) => {
        setupEnv(cmdObj.envPath);

        if (cmdObj.filterDescription) {
          logger.warn(
            'The --filter-description option is deprecated and no longer supported. The argument will be ignored.',
          );
        }

        if (directory) {
          setConfigDirectoryPath(directory);
        }
        // Determine browser behavior
        const browserBehavior = cmdObj.yes
          ? BrowserBehavior.OPEN
          : cmdObj.no
            ? BrowserBehavior.SKIP
            : BrowserBehavior.ASK;

        if (cmdObj.id !== undefined) {
          if (cmdObj.id === '') {
            logger.error('Eval ID cannot be empty when using --id.');
            process.exitCode = 1;
            return;
          }

          if (cmdObj.id === '.' || cmdObj.id === '..') {
            logger.error(
              'Eval IDs "." and ".." cannot be opened with --id because browsers normalize dot-segment URL paths.',
            );
            process.exitCode = 1;
            return;
          }

          if (/%[0-9a-f]{2}/i.test(cmdObj.id)) {
            logger.error(
              'Eval IDs containing literal percent-encoded sequences cannot be opened with --id because routers may decode them into different IDs.',
            );
            process.exitCode = 1;
            return;
          }

          await startServer(cmdObj.port, browserBehavior, `/eval/${encodeURIComponent(cmdObj.id)}`);
          return;
        }

        await startServer(cmdObj.port, browserBehavior);
      },
    );
}
