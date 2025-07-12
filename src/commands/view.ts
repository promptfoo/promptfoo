import type { Command } from 'commander';
import { getDefaultPort } from '../constants';

export function viewCommand(program: Command) {
  program
    .command('view [directory]')
    .description('Start browser UI')
    .option('-p, --port <number>', 'Port number', getDefaultPort().toString())
    .option('-y, --yes', 'Skip confirmation and auto-open the URL')
    .option('-n, --no', 'Skip confirmation and do not open the URL')
    .option('--filter-description <pattern>', 'Filter evals by description using a regex pattern')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (directory: string | undefined, cmdObj: any) => {
      // Lazy load the action handler
      const { viewAction } = await import('./view/viewAction');
      await viewAction(directory, cmdObj);
    });
}