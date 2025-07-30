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
      await showAction(id, cmdObj);
    });

  // Add subcommands for specific types
  showCmd
    .command('eval [id]')
    .description('Show details of a specific evaluation')
    .action(async (id: string | undefined) => {
      const { handleEval } = await import('./show/showAction');
      const Eval = (await import('../models/eval')).default;

      if (id) {
        await handleEval(id);
      } else {
        const latestEval = await Eval.latest();
        if (latestEval) {
          await handleEval(latestEval.id);
        } else {
          const logger = (await import('../logger')).default;
          logger.error('No eval found');
          process.exitCode = 1;
        }
      }
    });

  showCmd
    .command('prompt [id]')
    .description('Show details of a specific prompt')
    .action(async (id: string | undefined) => {
      if (!id) {
        const logger = (await import('../logger')).default;
        logger.error('Prompt ID is required');
        process.exitCode = 1;
        return;
      }
      const { handlePrompt } = await import('./show/showAction');
      await handlePrompt(id);
    });

  showCmd
    .command('dataset [id]')
    .description('Show details of a specific dataset')
    .action(async (id: string | undefined) => {
      if (!id) {
        const logger = (await import('../logger')).default;
        logger.error('Dataset ID is required');
        process.exitCode = 1;
        return;
      }
      const { handleDataset } = await import('./show/showAction');
      await handleDataset(id);
    });
}
