import type { Command } from 'commander';

// Re-export for backward compatibility
export { handleEvalDelete, handleEvalDeleteAll } from './delete/deleteAction';

export function deleteCommand(program: Command) {
  const deleteCommand = program
    .command('delete <id>')
    .description('Delete various resources')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (id: string, cmdObj: { envPath?: string }) => {
      const { deleteAction } = await import('./delete/deleteAction');
      await deleteAction(id, cmdObj);
    });

  deleteCommand
    .command('eval <id>')
    .description(
      'Delete an evaluation by ID. Use "latest" to delete the most recent evaluation, or "all" to delete all evaluations.',
    )
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (evalId, cmdObj) => {
      const { deleteEvalAction } = await import('./delete/deleteAction');
      await deleteEvalAction(evalId, cmdObj);
    });
}
