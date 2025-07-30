import type { Command } from 'commander';

export { handleDataset, handleEval, handlePrompt } from './show/showAction';

export function showCommand(program: Command) {
  program
    .command('show <id>')
    .description('Show details of a specific evaluation, prompt, or dataset')
    .option(
      '--env-path <path>',
      'Path to the environment directory or file (usually .env, .env.local, or .env.production)',
    )
    .action(async (id: string, cmdObj: { envPath?: string }) => {
      const { showAction } = await import('./show/showAction');
      await showAction(id, cmdObj);
    });
}
