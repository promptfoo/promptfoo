import type { Command } from 'commander';

export function listCommand(program: Command) {
  const listCommand = program.command('list').description('List various resources');

  listCommand
    .command('evals')
    .description('List evaluations')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of evaluations to display')
    .option('--ids-only', 'Only show evaluation IDs')
    .action(async (cmdObj: { envPath?: string; n?: string; idsOnly?: boolean }) => {
      const { listEvalsAction } = await import('./list/listAction');
      await listEvalsAction(cmdObj);
    });

  listCommand
    .command('prompts')
    .description('List prompts')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of prompts to display')
    .option('--ids-only', 'Only show prompt IDs')
    .action(async (cmdObj: { envPath?: string; n?: string; idsOnly?: boolean }) => {
      const { listPromptsAction } = await import('./list/listAction');
      await listPromptsAction(cmdObj);
    });

  listCommand
    .command('datasets')
    .description('List datasets')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of datasets to display')
    .option('--ids-only', 'Only show dataset IDs')
    .action(async (cmdObj: { envPath?: string; n?: string; idsOnly?: boolean }) => {
      const { listDatasetsAction } = await import('./list/listAction');
      await listDatasetsAction(cmdObj);
    });
}
