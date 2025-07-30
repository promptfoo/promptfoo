import type { Command } from 'commander';

export { checkModelAuditInstalled } from './modelScan/modelScanAction';

export function modelScanCommand(program: Command) {
  program
    .command('scan-model <modelPaths...>')
    .description('Scan model files for security risks')
    .option('--blacklist [pattern]', 'Blacklist pattern to ignore files')
    .option('--format [format]', 'Output format (json or console)', 'console')
    .option('--output [file]', 'Output file for results')
    .option('--timeout [seconds]', 'Scan timeout in seconds', '600')
    .option('--verbose', 'Enable verbose output')
    .option('--max-file-size [bytes]', 'Maximum file size to scan', '1000000')
    .option('--max-total-size [bytes]', 'Maximum total size of all files', '5000000')
    .action(async (modelPaths: string[], options: any) => {
      const { modelScanAction } = await import('./modelScan/modelScanAction');
      await modelScanAction(modelPaths, options);
    });
}
