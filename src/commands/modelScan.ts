import chalk from 'chalk';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import type { Command } from 'commander';
import { promisify } from 'util';
import { getUserEmail } from '../globalConfig/accounts';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';

const execAsync = promisify(exec);

async function checkModelAuditInstalled(): Promise<boolean> {
  try {
    await execAsync('modelaudit --version');
    return true;
  } catch {
    return false;
  }
}

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
    .option('--max-file-size <bytes>', 'Maximum file size to scan in bytes')
    .action(async (paths: string[], options) => {
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

      const args = ['scan'];

      // Add all paths
      args.push(...paths);

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
        args.push('--timeout', options.timeout);
      }

      if (options.maxFileSize) {
        args.push('--max-file-size', options.maxFileSize);
      }

      logger.info(`Running model scan on: ${paths.join(', ')}`);

      // Get authentication credentials from promptfoo
      const apiKey = cloudConfig.getApiKey();
      const userEmail = getUserEmail();
      const apiHost = cloudConfig.getApiHost();
      const appUrl = cloudConfig.getAppUrl();

      // Prepare environment variables using standardized interface
      const env = {
        ...process.env,
      };

      // Pass promptfoo authentication to modelaudit using standardized interface
      if (apiKey) {
        env.PROMPTFOO_API_KEY = apiKey;
        env.PROMPTFOO_API_HOST = apiHost;
        env.PROMPTFOO_INTERFACE_VERSION = '1.0';
        if (userEmail) {
          env.PROMPTFOO_USER_EMAIL = userEmail;
        }
        if (appUrl) {
          env.PROMPTFOO_APP_URL = appUrl;
        }
        logger.info(
          `Using promptfoo authentication for modelaudit (${userEmail || 'authenticated user'})`,
        );
        logger.debug(
          `Credentials passed via environment: API_KEY=${apiKey ? 'present' : 'missing'}, HOST=${apiHost}`,
        );
      } else {
        logger.info(
          'No promptfoo authentication found. ModelAudit will run without authentication.',
        );
        logger.info('For authenticated scans, run: promptfoo auth login');
      }

      const modelAudit = spawn('modelaudit', args, {
        stdio: 'inherit',
        env,
      });

      modelAudit.on('error', (error) => {
        logger.error(`Failed to start modelaudit: ${error.message}`);
        logger.info('Make sure modelaudit is installed and available in your PATH.');
        logger.info('Install it using: pip install modelaudit');
        process.exit(1);
      });

      modelAudit.on('close', (code) => {
        if (code === 0) {
          logger.info('Model scan completed successfully.');
        } else if (code === 2) {
          logger.error('Model scan failed due to authentication error.');
          logger.info('Try running: promptfoo auth login');
          process.exit(code);
        } else if (code === 3) {
          logger.error('Model scan failed due to configuration error.');
          process.exit(code);
        } else {
          logger.error(`Model scan completed with issues. Exit code: ${code}`);
          process.exit(code || 1);
        }
      });
    });
}
