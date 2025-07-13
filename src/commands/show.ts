import type { Command } from 'commander';

// Re-export functions for backward compatibility
export { handlePrompt, handleEval, handleDataset } from './show/showAction';

export async function showCommand(program: Command) {
  const showCommand = program
    .command('show [id]')
    .description('Show details of a specific resource (defaults to most recent)')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (id: string | undefined, cmdObj: { envPath?: string }) => {
      const { showAction } = await import('./show/showAction');
      await showAction(id, cmdObj);
    });

  showCommand
    .command('eval [id]')
    .description('Show details of a specific evaluation (defaults to most recent)')
    .action(async (id?: string) => {
      const [{ handleEval }, { default: Eval }, { default: logger }] = await Promise.all([
        import('./show/showAction'),
        import('../models/eval'),
        import('../logger'),
      ]);

      if (!id) {
        const latestEval = await Eval.latest();
        if (latestEval) {
          return handleEval(latestEval.id);
        }
        logger.error('No eval found');
        process.exitCode = 1;
        return;
      }
      return handleEval(id);
    });

  showCommand
    .command('prompt <id>')
    .description('Show details of a specific prompt')
    .action(async (id: string) => {
      const { handlePrompt } = await import('./show/showAction');
      await handlePrompt(id);
    });

  showCommand
    .command('dataset <id>')
    .description('Show details of a specific dataset')
    .action(async (id: string) => {
      const { handleDataset } = await import('./show/showAction');
      await handleDataset(id);
    });
}
