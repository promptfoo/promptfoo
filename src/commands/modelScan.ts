import type { Command } from 'commander';

// Re-export for backward compatibility
export { checkModelAuditInstalled } from './modelScan/modelScanAction';

export function modelScanCommand(program: Command): void {
  program
    .command('scan-model')
    .description('Scan ML models for security vulnerabilities')
    .argument('[paths...]', 'Paths to model files or directories to scan')
    .option(
      '-b, --blacklist <pattern>',
      'Additional blacklist patterns to check against model names',
      (val: string, acc: string[]) => [...acc, val],
      [] as string[],
    )
    .option('-f, --format <format>', 'Output format (text or json)', 'text')
    .option('-o, --output <path>', 'Output file path (prints to stdout if not specified)')
    .option(
      '-t, --timeout <seconds>',
      'Scan timeout in seconds',
      (val) => Number.parseInt(val, 10),
      300,
    )
    .option('-v, --verbose', 'Enable verbose output')
    .option('--max-file-size <bytes>', 'Maximum file size to scan in bytes')
    .option('--max-total-size <bytes>', 'Maximum total bytes to scan before stopping')
    .action(async (paths: string[], options) => {
      const { modelScanAction } = await import('./modelScan/modelScanAction');
      await modelScanAction(paths, options);
    });
}
