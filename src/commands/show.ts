import type { Command } from 'commander';

export { handleDataset, handleEval, handlePrompt } from './show/showAction';

export function showCommand(program: Command) {
  const showCmd = program
    .command('show [id]')
    .description('Show details of a specific evaluation, prompt, or dataset')
    .option(
      '--env-path <path>',
      'Path to the environment directory or file (usually .env, .env.local, or .env.production)',
    )
    .action(async (id: string | undefined, cmdObj: { envPath?: string }) => {
      const { showAction } = await import('./show/showAction');
      await showAction(id || 'latest', cmdObj);
    });

  // Add subcommands for specific types
  showCmd
    .command('eval [id]')
    .description('Show details of a specific evaluation')
    .action(async (id: string | undefined) => {
      const { handleEval } = await import('./show/showAction');
      await handleEval(id || 'latest');
    });

  showCmd
    .command('prompt [id]')
    .description('Show details of a specific prompt')
    .action(async (id: string | undefined) => {
      const { handlePrompt } = await import('./show/showAction');
      await handlePrompt(id || 'latest');
    });

  showCmd
    .command('dataset [id]')
    .description('Show details of a specific dataset')
    .action(async (id: string | undefined) => {
      const { handleDataset } = await import('./show/showAction');
      await handleDataset(id || 'latest');
    });
}
