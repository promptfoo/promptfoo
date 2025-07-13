import chalk from 'chalk';
import { spawn } from 'child_process';
import logger from '../../logger';

export async function checkModelAuditInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('modelaudit', ['--version'], { 
      stdio: 'ignore',
      shell: true 
    });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

export async function modelScanAction(
  paths: string[],
  options: {
    blacklist?: string[];
    format?: string;
    output?: string;
    timeout?: number;
    verbose?: boolean;
    maxFileSize?: string;
    maxTotalSize?: string;
  },
): Promise<void> {
  if (!paths || paths.length === 0) {
    logger.error(
      'No paths specified. Please provide at least one model file or directory to scan.',
    );
    process.exit(1);
  }

  // Check if modelaudit is installed
  const isModelAuditInstalled = await checkModelAuditInstalled();
  if (!isModelAuditInstalled) {
    logger.error('ModelAudit is not installed.');
    logger.info(`Please install it using: ${chalk.green('pip install modelaudit')}`);
    logger.info('For more information, visit: https://www.promptfoo.dev/docs/model-audit/');
    process.exit(1);
  }

  const args = ['scan', ...paths];

  // Add options
  if (options.blacklist && options.blacklist.length > 0) {
    options.blacklist.forEach((pattern: string) => {
      args.push('--blacklist', pattern);
    });
  }

  if (options.format) {
    args.push('--format', options.format);
  }

  if (options.output) {
    args.push('--output', options.output);
  }

  if (options.timeout) {
    args.push('--timeout', options.timeout.toString());
  }

  if (options.verbose) {
    args.push('--verbose');
  }

  if (options.maxFileSize) {
    args.push('--max-file-size', options.maxFileSize);
  }

  if (options.maxTotalSize) {
    args.push('--max-total-size', options.maxTotalSize);
  }

  logger.info(`Running model scan on: ${paths.join(', ')}`);

  const modelAudit = spawn('modelaudit', args, { stdio: 'inherit' });

  modelAudit.on('error', (error) => {
    logger.error(`Failed to start modelaudit: ${error.message}`);
    logger.info('Make sure modelaudit is installed and available in your PATH.');
    logger.info('Install it using: pip install modelaudit');
    process.exit(1);
  });

  modelAudit.on('close', (code) => {
    if (code === 0) {
      logger.info('Model scan completed successfully.');
    } else {
      logger.error(`Model scan completed with issues. Exit code: ${code}`);
      process.exit(code || 1);
    }
  });
}
