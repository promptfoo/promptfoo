import chalk from 'chalk';
import type { Command } from 'commander';
import { z } from 'zod';
import cliState from '../../cliState';
import { VERSION } from '../../constants';
import { getUserEmail } from '../../globalConfig/accounts';
import logger, { setLogLevel } from '../../logger';
import telemetry from '../../telemetry';
import type { ProviderOptions } from '../../types/providers';
import { setupEnv } from '../../util';
import { getProviderFromCloud } from '../../util/cloud';
import { readConfig } from '../../util/config/load';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl } from '../remoteGeneration';

const ArgsSchema = z.object({
  config: z.string().optional(),
  target: z.string().optional(),
  envPath: z.string().optional(),
  verbose: z.boolean().optional(),
  preview: z.boolean().optional(),
});

type Args = z.infer<typeof ArgsSchema>;

type TargetConfig = ProviderOptions & { id: string };

/**
 * Performs target purpose discovery.
 */
async function doTargetPurposeDiscovery(config: TargetConfig): Promise<string> {
  const res = await fetch(getRemoteGenerationUrl(), {
    body: JSON.stringify({
      task: 'target-purpose-discovery',
      target: config,
      version: VERSION,
      email: getUserEmail(),
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  const data = await res.json();
  return data.purpose;
}

/**
 * Registers the `discover` command with the CLI.
 */
export function discoverCommand(program: Command) {
  program
    .command('discover')
    .description(
      "Automatically discover a target application's purpose, enhancing attack probe efficacy.",
    )
    .option(
      '-c, --config [path]',
      'Path to configuration file or cloud config UUID. Defaults to promptfooconfig.yaml',
    )
    .option('-t, --target <id>', 'Cloud provider target ID to run the scan on')
    .option('--preview', 'Preview discovery results without modifying the config file', false)
    .option('--env-file, --env-path <path>', 'Path to a custom .env file')
    .option('-v, --verbose', 'Show debug logs')
    .action(async (opts: Args) => {
      // Set up the environment:
      setupEnv(opts.envPath);

      // Set up logging:
      if (opts.verbose) {
        setLogLevel('debug');
      }

      // Record telemetry:
      telemetry.record('command_used', {
        name: 'redteam discover',
      });

      // Always use remote for discovery
      cliState.remote = true;

      // Validate the arguments:
      const { success, data: args, error } = ArgsSchema.safeParse(opts);
      if (!success) {
        logger.error('Invalid options:');
        error.issues.forEach((issue) => {
          logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
        });
        process.exitCode = 1;
        return;
      }

      // A config or a target must be provided:
      if (!args.config && !args.target) {
        logger.error('Either a config or a target must be provided');
        process.exitCode = 1;
        return;
      }

      let targetConfig: TargetConfig | undefined;

      // Handle config:
      if (args.config) {
        const config = await readConfig(args.config);

        // Use the first target:
        if (config.targets && Array.isArray(config.targets) && config.targets.length > 0) {
          targetConfig = config.targets[0] as TargetConfig;
        }
        // Fallback to the first provider:
        else if (
          config.providers &&
          Array.isArray(config.providers) &&
          config.providers.length > 0
        ) {
          targetConfig = config.providers[0] as TargetConfig;
        }
        // No targets or providers found:
        else {
          logger.error('No targets or providers found in the config');
          process.exitCode = 1;
          return;
        }
      }

      // Handle target:
      if (args.target) {
        targetConfig = await getProviderFromCloud(args.target);
      }

      invariant(targetConfig, 'An error occurred loading the target config');

      try {
        const purpose = await doTargetPurposeDiscovery(targetConfig!);

        if (args.preview) {
          logger.info(`${chalk.cyan.bold('Application Purpose:')}\n\n${purpose}`);
        } else {
          // TODO(will): Implement this.
          throw new Error('Not implemented');
        }
      } catch (error) {
        logger.error(
          `An unexpected error occurred during target discovery: ${error instanceof Error ? error.message : String(error)}\n${
            error instanceof Error ? error.stack : ''
          }`,
        );
        process.exitCode = 1;
      }
    });
}
