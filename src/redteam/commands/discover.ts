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
      let targets: Provider[] = [];

      // If user provides a config, read all targets from it:
      if (args.config) {
        config = await readConfig(args.config);
        invariant(config, 'An error occurred loading the config');
        invariant(config.providers, 'Config must contain targets or providers');
        targets = Array.isArray(config.providers) ? config.providers : [config.providers];
      }
      // If the target flag is provided, load it from Cloud:
      else if (args.target) {
        targets = [
          // Let the internal error handling bubble up:
          await getProviderFromCloud(args.target),
        ];
      }

      // TODO: Verify that providers are not scripts?

      // At this point, we should have at least one target:
      invariant(targets.length > 0, 'An error occurred loading the target config');

      // Iterate through the targets and discover the purpose for each:
      let targetIdx = 0;
      const purposes: Record<number, string> = {};

      for await (const target of targets) {
        const targetLabel = typeof target === 'string' ? target : (target.label ?? target.id);
        logger.info(`Discovering purpose for ${chalk.yellow(targetLabel)}`);
        try {
          purposes[targetIdx] = await doTargetPurposeDiscovery(target);
        } catch (error) {
          logger.error(
            `An unexpected error occurred during target discovery: ${error instanceof Error ? error.message : String(error)}\n${
              error instanceof Error ? error.stack : ''
            }`,
          );
          process.exitCode = 1;
          return;
        } finally {
          targetIdx++;
        }
      }

      // Then, handle the response:
      // If preview is enabled, print the purpose to the console:
      if (args.preview) {
        for (const [targetIdx, purpose] of Object.entries(purposes)) {
          const target = targets[Number(targetIdx)];
          const targetLabel = typeof target === 'string' ? target : (target.label ?? target.id);
          logger.info(`\nPurpose of ${chalk.yellow(targetLabel)}:\n\n${purpose}\n`);
        }
      } else {
        // Persist the purposes:
        if (args.target) {
          // TODO(Will): Save to the database
          throw new Error('Saving purpose to database is not yet implemented');
        } else {
          // Map each purpose to its target:
          for (const [targetIdx, purpose] of Object.entries(purposes)) {
            const idxNum = Number(targetIdx);
            if (typeof targets[idxNum] === 'string') {
              targets[idxNum] = {
                id: targets[idxNum] as string,
                purpose,
              } as Provider;
            } else {
              targets[idxNum].purpose = purpose;
            }
          }

          // TODO(Will): Fix this type error
          //@ts-expect-error:
          config.providers = targets;
          writePromptfooConfig(config as UnifiedConfig, args.config!);
          logger.info(
            chalk.green(
              `\nPurpose discovery complete!\nResults have been written to ${args.config}`,
            ),
          );
        }
      }
    });
}
