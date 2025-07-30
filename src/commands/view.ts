import type { Command } from 'commander';

export function viewCommand(program: Command) {
  program
    .command('view [directory]')
    .option('-p, --port <number>', 'Port number', '15500')
    .option('-y, --yes', 'Skip confirmation and auto-open the URL')
    .option('-n, --no', 'Skip confirmation and do not open the URL')
    .option('--api-base-url <url>', 'Base URL for viewer API calls')
    .option('--filter-description <pattern>', 'Filter evals by description using a regex pattern')
    .option('--share', 'Create a shareable URL')
    .option(
      '--env-path <path>',
      'Path to the environment directory or file (usually .env, .env.local, or .env.production)',
    )
    .description('Start browser UI')
    .action(async (directory: string | undefined, cmdObj: any) => {
      const { viewAction } = await import('./view/viewAction');
      await viewAction(directory, cmdObj);
    });
}
