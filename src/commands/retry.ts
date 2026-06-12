import chalk from 'chalk';
import dedent from 'dedent';
import logger from '../logger';
import { retryCommand } from '../node/retry';
import { ConfigResolutionError, logConfigResolutionError } from '../util/config/errors';
import type { Command } from 'commander';

import type { RetryCommandOptions } from '../node/retry';

/**
 * Set up the retry command.
 */
export function setupRetryCommand(program: Command) {
  program
    .command('retry <evalId>')
    .description('Retry all ERROR results from a given evaluation')
    .option(
      '-c, --config <path>',
      'Path to configuration file (optional, uses original eval config if not provided)',
    )
    .option('-v, --verbose', 'Verbose output')
    .option('--max-concurrency <number>', 'Maximum number of concurrent evaluations', parseInt)
    .option('--delay <number>', 'Delay between evaluations in milliseconds', parseInt)
    .option('--share', 'Share results to cloud (auto-shares when cloud is configured)')
    .option('--no-share', 'Do not share results to cloud')
    .action(async (evalId: string, cmdObj: RetryCommandOptions) => {
      try {
        await retryCommand(evalId, cmdObj);
      } catch (error) {
        if (error instanceof ConfigResolutionError) {
          logConfigResolutionError(error);
        } else {
          logger.error('Failed to retry evaluation', { error, evalId });
          logger.info(
            chalk.yellow(dedent`

              Recovery options:
                - Run the same retry command again to continue
                - Check API credentials and network connectivity
                - Use --verbose for detailed error information
            `),
          );
        }
        process.exitCode = 1;
      }
    });
}

// Preserve established command-module imports while the implementation lives in the node layer.
export {
  deleteErrorResults,
  getErrorResultIds,
  recalculatePromptMetrics,
  retryCommand,
} from '../node/retry';

export type { RetryCommandOptions };
