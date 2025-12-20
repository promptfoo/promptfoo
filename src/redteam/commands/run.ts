import chalk from 'chalk';
import dedent from 'dedent';
import { z } from 'zod';
import cliState from '../../cliState';
import { CLOUD_PROVIDER_PREFIX } from '../../constants';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import telemetry from '../../telemetry';
import {
  getCompletedPairsFromCloud,
  getConfigFromCloud,
  getEvalFromCloud,
  streamResultsToCloud,
} from '../../util/cloud';
import { setupEnv } from '../../util/index';
import { doRedteamResume, doRedteamRun } from '../shared';
import { poisonCommand } from './poison';
import type { Command } from 'commander';

import type { RedteamRunOptions } from '../types';

const UUID_REGEX = /^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$/;
// Cloud eval IDs can be in format: eval-XXX-YYYY-MM-DDTHH:MM:SS
const CLOUD_EVAL_ID_REGEX = /^eval-[A-Za-z0-9]+-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export function redteamRunCommand(program: Command) {
  program
    .command('run')
    .description(
      dedent`
        ${chalk.red('Red team')} a target application, a two-step process:

        1. Generates dynamic attack probes (i.e. test cases) tailored to your target application using specialized uncensored models.
        2. Evaluates the generated probes against your target application.
      `,
    )
    .option(
      '-c, --config [path]',
      'Path to configuration file or cloud config UUID. Defaults to promptfooconfig.yaml',
    )
    .option(
      '-o, --output [path]',
      'Path to output file for generated tests. Defaults to redteam.yaml in the same directory as the configuration file.',
    )
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('-j, --max-concurrency <number>', 'Maximum number of concurrent API calls', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--delay <number>', 'Delay in milliseconds between API calls', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--remote', 'Force remote inference wherever possible', false)
    .option('--force', 'Force generation even if no changes are detected', false)
    .option('--no-progress-bar', 'Do not show progress bar')
    .option(
      '--filter-providers, --filter-targets <providers>',
      'Only run tests with these providers (regex match)',
    )
    .option('-t, --target <id>', 'Cloud provider target ID to run the scan on')
    .option(
      '--resume <evalId>',
      'Resume a partially completed cloud scan by eval ID. Skips test generation and completed tests.',
    )
    .action(async (opts: RedteamRunOptions & { resume?: string }) => {
      setupEnv(opts.envPath);
      telemetry.record('redteam run', {});

      // Handle --resume flag for cloud resume
      if (opts.resume) {
        if (!UUID_REGEX.test(opts.resume) && !CLOUD_EVAL_ID_REGEX.test(opts.resume)) {
          logger.error('Invalid eval ID for --resume. It must be a valid UUID or cloud eval ID.');
          process.exitCode = 1;
          return;
        }

        if (!cloudConfig.isEnabled()) {
          logger.error(
            'Cloud is not configured. Please run `promptfoo auth login` to enable cloud features before resuming a scan.',
          );
          process.exitCode = 1;
          return;
        }

        try {
          logger.info(`Resuming scan from eval ${opts.resume}...`);

          // Fetch the eval from cloud to get the config with generated tests
          const cloudEval = await getEvalFromCloud(opts.resume);

          if (
            !cloudEval.config ||
            !cloudEval.config.tests ||
            !Array.isArray(cloudEval.config.tests) ||
            cloudEval.config.tests.length === 0
          ) {
            logger.error(
              'Cannot resume: the eval does not contain generated tests. The scan may have failed before test generation completed.',
            );
            process.exitCode = 1;
            return;
          }

          // Fetch completed pairs from cloud
          const completedPairs = await getCompletedPairsFromCloud(opts.resume);

          // Set up cliState for resume mode
          cliState.resume = true;
          cliState.cloudResumeEvalId = opts.resume;
          cliState.cloudCompletedPairs = completedPairs;

          if (opts.remote) {
            cliState.remote = true;
          }

          // Create a result streaming callback to send results back to cloud
          const resultBuffer: any[] = [];
          const BATCH_SIZE = parseInt(process.env.PROMPTFOO_SHARE_CHUNK_SIZE || '10', 10);
          logger.debug(`Using result stream batch size: ${BATCH_SIZE}`);

          const resultStreamCallback = async (result: any) => {
            resultBuffer.push(result);
            if (resultBuffer.length >= BATCH_SIZE) {
              const toSend = resultBuffer.splice(0, resultBuffer.length);
              try {
                await streamResultsToCloud(opts.resume!, toSend);
              } catch (error) {
                logger.warn(`Failed to stream results to cloud: ${error}`);
                // Re-add to buffer on failure
                resultBuffer.unshift(...toSend);
              }
            }
          };

          // Run the resume
          await doRedteamResume({
            ...opts,
            liveRedteamConfig: cloudEval.config,
            resumeEvalId: opts.resume,
            resultStreamCallback,
          });

          // Flush any remaining results
          if (resultBuffer.length > 0) {
            try {
              await streamResultsToCloud(opts.resume, resultBuffer);
            } catch (error) {
              logger.warn(`Failed to flush remaining results to cloud: ${error}`);
            }
          }

          // Clean up cliState
          cliState.resume = false;
          cliState.cloudResumeEvalId = undefined;
          cliState.cloudCompletedPairs = undefined;

          logger.info(
            chalk.blue(`\nView results at: ${cloudConfig.getAppUrl()}/eval/${opts.resume}`),
          );
        } catch (error) {
          // Clean up cliState on error
          cliState.resume = false;
          cliState.cloudResumeEvalId = undefined;
          cliState.cloudCompletedPairs = undefined;

          logger.error(
            `Failed to resume scan: ${error instanceof Error ? error.message : String(error)}`,
          );
          process.exitCode = 1;
        }
        return;
      }

      if (opts.config && UUID_REGEX.test(opts.config)) {
        if (opts.target && !UUID_REGEX.test(opts.target)) {
          throw new Error('Invalid target ID, it must be a valid UUID');
        }
        const configObj = await getConfigFromCloud(opts.config, opts.target);

        // backwards compatible for old cloud servers
        if (
          opts.target &&
          UUID_REGEX.test(opts.target) &&
          (!configObj.targets || configObj.targets?.length === 0)
        ) {
          configObj.targets = [{ id: `${CLOUD_PROVIDER_PREFIX}${opts.target}`, config: {} }];
        }
        opts.liveRedteamConfig = configObj;
        opts.config = undefined;

        opts.loadedFromCloud = true;
      } else if (opts.target) {
        logger.error(
          `Target ID (-t) can only be used when -c is used. To use a cloud target inside of a config set the id of the target to ${CLOUD_PROVIDER_PREFIX}${opts.target}. `,
        );
        process.exitCode = 1;
        return;
      }

      try {
        if (opts.remote) {
          cliState.remote = true;
        }
        await doRedteamRun(opts);
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.error('Invalid options:');
          error.errors.forEach((err: z.ZodIssue) => {
            logger.error(`  ${err.path.join('.')}: ${err.message}`);
          });
        } else {
          logger.error(
            `An unexpected error occurred during red team run: ${error instanceof Error ? error.message : String(error)}\n${
              error instanceof Error ? error.stack : ''
            }`,
          );
        }
        process.exitCode = 1;
      }
    });

  poisonCommand(program);
}
