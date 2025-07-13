import type { Command } from 'commander';

export function exportCommand(program: Command) {
  program
    .command('export <evalId>')
    .description('Export an eval record to a JSON file')
    .option('-o, --output [outputPath]', 'Output path for the exported file')
    .action(async (evalId, cmdObj) => {
      const { exportAction } = await import('./export/exportAction');
      await exportAction(evalId, cmdObj);
    });
}
