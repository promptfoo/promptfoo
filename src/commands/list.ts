import type { Command } from 'commander';

export function listCommand(program: Command) {
  program
    .command('list')
    .description('List recent evaluations')
    .option('-n, --limit <limit>', 'Number of evaluations to display', '20')
    .option(
      '--env-path <path>',
      'Path to the environment directory or file (usually .env, .env.local, or .env.production)',
    )
    .action(async (cmdObj: { limit: string; envPath?: string }) => {
      const { listEvalsAction } = await import('./list/listAction');
      await listEvalsAction({ envPath: cmdObj.envPath, n: cmdObj.limit });
    });
}
