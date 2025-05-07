import chalk from 'chalk';
import type { Command } from 'commander';
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
      '-c, --config <path>',
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
        logger.error(
          'A config (-c, --config <path>) or a target (-t, --target <id>) must be provided!\n',
        );
        process.exitCode = 1;
        return;
      }

      let config: UnifiedConfig | null = null;

      // Although the providers/targets property supports multiple values, Redteaming only supports
      // a single target at a time.
      let target: any | undefined = undefined;

      // If user provides a config, read the target from it:
      if (args.config) {
        config = await readConfig(args.config);
        invariant(config, 'An error occurred loading the config');
        invariant(config.providers, 'Config must contain targets or providers');
        target = Array.isArray(config.providers) ? config.providers[0] : config.providers;
      }
      // If the target flag is provided, load it from Cloud:
      else if (args.target) {
        // Let the internal error handling bubble up:
        target = await getProviderFromCloud(args.target);
      }

      // At this point, we should have at least one target:
      invariant(target != undefined, 'An error occurred loading the target config');

      // Discover the purpose for the target:
      logger.info('Discovering purpose...');
      let purpose: string | undefined = undefined;
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

      logger.info(`\nPurpose:\n\n${chalk.green(purpose)}\n`);

      // Then, handle the response:
      // If preview is enabled, print the purpose to the console:
      if (!args.preview) {
        // Persist the purposes:
        if (args.target) {
          // TODO(Will): Save to the database
          throw new Error('Saving purpose to database is not yet implemented');
        } else {
          invariant(config, 'Config is required');

          // Set the `purpose` property on the provider:
          if (typeof config.providers === 'string') {
            // If providers is a string, convert to ProviderOptions object
            config.providers = { id: config.providers, purpose } as any;
          } else if (Array.isArray(config.providers)) {
            // If providers is an array
            if (config.providers.length > 0) {
              const first = config.providers[0];
              if (typeof first === 'string') {
                // Replace first element with ProviderOptions
                config.providers[0] = { id: first, purpose } as any;
              } else if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
                // Could be ProviderOptions or record<string, ProviderOptions>
                if ('id' in first || 'purpose' in first) {
                  // Looks like ProviderOptions
                  (first as any).purpose = purpose;
                } else {
                  // Looks like record<string, ProviderOptions>
                  const keys = Object.keys(first);
                  if (keys.length > 0) {
                    (first as any)[keys[0]].purpose = purpose;
                  }
                }
              }
            }
          } else if (typeof config.providers === 'object' && config.providers !== null) {
            // If providers is a record<string, ProviderOptions>
            const keys = Object.keys(config.providers);
            if (keys.length > 0) {
              (config.providers as any)[keys[0]].purpose = purpose;
            }
          }

          writePromptfooConfig(config as UnifiedConfig, args.config!);
          logger.info(
            `Purpose written to ${chalk.italic(args.config)} under key ${chalk.magenta('\`providers[0].purpose\`')}.`,
          );
        }
      }
    });
}
