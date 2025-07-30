import type { Command } from 'commander';

export { handleEvalDelete, handleEvalDeleteAll } from './delete/deleteAction';

export function deleteCommand(program: Command) {
  program
    .command('delete <evalId>')
    .description('Delete an evaluation by ID')
    .option('-y, --yes', 'Skip confirmation')
    .option(
      '--env-path <path>',
      'Path to the environment directory or file (usually .env, .env.local, or .env.production)',
    )
    .action(async (evalId: string, cmdObj: { yes: boolean; envPath?: string }) => {
      const { deleteAction } = await import('./delete/deleteAction');
      await deleteAction(evalId, cmdObj);
    });
}
