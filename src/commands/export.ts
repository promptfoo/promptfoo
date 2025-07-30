import type { Command } from 'commander';

export function exportCommand(program: Command) {
  program
    .command('export <evalId>')
    .description('Export an evaluation to a JSON file')
    .option('-o, --output <path>', 'Output file path')
    .option(
      '--env-path <path>',
      'Path to the environment directory or file (usually .env, .env.local, or .env.production)',
    )
    .action(async (evalId: string, cmdObj: { output?: string; envPath?: string }) => {
      const { exportAction } = await import('./export/exportAction');
      await exportAction(evalId, cmdObj);
    });
}
