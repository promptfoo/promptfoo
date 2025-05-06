import chalk from 'chalk';
import type { Command } from 'commander';
import { produce, type Draft } from 'immer';
import type { UnifiedConfig } from 'src/types';
import { z } from 'zod';
import cliState from '../../cliState';
import { VERSION } from '../../constants';
import { getUserEmail } from '../../globalConfig/accounts';
import logger, { setLogLevel } from '../../logger';
import telemetry from '../../telemetry';
import { setupEnv } from '../../util';
import { getProviderFromCloud } from '../../util/cloud';
import { readConfig } from '../../util/config/load';
import { writePromptfooConfig } from '../../util/config/manage';
import invariant from '../../util/invariant';
import { type Provider } from '../../validators/providers';
import { getRemoteGenerationUrl } from '../remoteGeneration';

const ArgsSchema = z.object({
  config: z.string().optional(),
  target: z.string().optional(),
  envPath: z.string().optional(),
  verbose: z.boolean().optional(),
  preview: z.boolean().optional(),
});

type Args = z.infer<typeof ArgsSchema>;

/**
 * Sends the target purpose discover task request to the cloud server.
 */
async function doTargetPurposeDiscovery(target: Provider): Promise<string> {
  const res = await fetch(getRemoteGenerationUrl(), {
    body: JSON.stringify({
      task: 'target-purpose-discovery',
      target,
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

      let config: UnifiedConfig | null = null;
      let targets: Provider[] = [];
      let targetConfigKey: 'targets' | 'providers';

      // If user provides a config, read all targets from it:
      if (args.config) {
        config = await readConfig(args.config);
        invariant(config, 'An error occurred loading the config');

        // Determine whether to read from the 'providers' or 'targets' key:
        if (config.targets && Array.isArray(config.targets) && config.targets.length > 0) {
          targets = config.targets;
          targetConfigKey = 'targets';
        } else if (
          config.providers &&
          Array.isArray(config.providers) &&
          config.providers.length > 0
        ) {
          targets = config.providers;
          targetConfigKey = 'providers';
        } else {
          // Sanity check:
          invariant(false, 'Config is missing both "targets" and "providers" keys');
        }
      }

      // Handle target: load it from Cloud.
      if (args.target) {
        targets.push(await getProviderFromCloud(args.target));
      }

      invariant(targets.length === 0, 'An error occurred loading the target config');

      let targetIdx = 0;
      const purposes: Record<number, string> = {};

      for await (const target of targets) {
        // TODO(will): Fix these!
        const targetLabel = target.label ?? target.id;
        logger.info(`Discovering purpose for ${targetLabel}`);

        let purpose: string | null = null;

        try {
          purpose = await doTargetPurposeDiscovery(target);
        } catch (error) {
          logger.error(
            `An unexpected error occurred during target discovery: ${error instanceof Error ? error.message : String(error)}\n${
              error instanceof Error ? error.stack : ''
            }`,
          );
          process.exitCode = 1;
          return;
        }

        // If preview is enabled, print the purpose to the console:
        if (args.preview) {
          logger.info(`${chalk.bold(`Application ${targetLabel} Purpose:`)}\n\n${purpose}`);
        } else {
          // Otherwise, save the purpose to the purposes object:
          purposes[targetIdx] = purpose;
        }

        targetIdx++;
      }

      // Persist the purposes:
      if (args.target) {
        // TODO(Will): Save to the database
        throw new Error('Saving purpose to database is not yet implemented');
      } else {
        const updatedConfig = produce(config, (draft: Draft<UnifiedConfig>) => {
          //@ts-expect-error:
          draft[targetConfigKey][targetIdx].purpose = purpose;
        });
        //@ts-expect-error:
        writePromptfooConfig(updatedConfig, args.config!);
      }
    });
}
