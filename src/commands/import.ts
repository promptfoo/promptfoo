import type { Command } from 'commander';

export function importCommand(program: Command) {
  program
    .command('import <file>')
    .description('Import an eval record from a JSON file')
    .action(async (file) => {
      const { importAction } = await import('./import/importAction');
      await importAction(file);
    });
}
