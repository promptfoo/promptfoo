import type { Command } from 'commander';

export function importCommand(program: Command) {
  program
    .command('import <filepath>')
    .description('Import an eval from a JSON file')
    .option(
      '--env-path <path>',
      'Path to the environment directory or file (usually .env, .env.local, or .env.production)',
    )
    .action(async (filePath: string, cmdObj: { envPath?: string }) => {
      const { importAction } = await import('./import/importAction');
      await importAction(filePath);
    });
}
