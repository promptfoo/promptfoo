import type { Command } from 'commander';

export function listCommand(program: Command) {
  const listCmd = program
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

  // Add subcommands
  listCmd
    .command('evals')
    .description('List recent evaluations')
    .option('-n, --limit <limit>', 'Number of evaluations to display', '20')
    .option('--ids-only', 'Display only IDs')
    .action(async (cmdObj: { limit?: string; idsOnly?: boolean }) => {
      const { listEvalsAction } = await import('./list/listAction');
      await listEvalsAction({ n: cmdObj.limit, idsOnly: cmdObj.idsOnly });
    });

  listCmd
    .command('prompts')
    .description('List recent prompts')
    .option('-n, --limit <limit>', 'Number of prompts to display', '20')
    .option('--ids-only', 'Display only IDs')
    .action(async (cmdObj: { limit?: string; idsOnly?: boolean }) => {
      const { listPromptsAction } = await import('./list/listAction');
      await listPromptsAction({ n: cmdObj.limit, idsOnly: cmdObj.idsOnly });
    });

  listCmd
    .command('datasets')
    .description('List recent datasets')
    .option('-n, --limit <limit>', 'Number of datasets to display', '20')
    .option('--ids-only', 'Display only IDs')
    .action(async (cmdObj: { limit?: string; idsOnly?: boolean }) => {
      const { listDatasetsAction } = await import('./list/listAction');
      await listDatasetsAction({ n: cmdObj.limit, idsOnly: cmdObj.idsOnly });
    });
}
