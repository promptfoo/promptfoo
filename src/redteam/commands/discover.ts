import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { type Command, Option } from 'commander';
import { z } from 'zod';
import cliState from '../../cliState';
import { VERSION } from '../../constants';
import { getEnvString } from '../../envars';
import { getUserEmail } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger, { setLogLevel } from '../../logger';
import { loadApiProvider, loadApiProviders } from '../../providers';
import telemetry from '../../telemetry';
import type { ApiProvider, UnifiedConfig } from '../../types';
import { setupEnv } from '../../util';
import { getProviderFromCloud } from '../../util/cloud';
import { readConfig } from '../../util/config/load';
import { writePromptfooConfig } from '../../util/config/manage';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl } from '../remoteGeneration';

const ArgsSchema = z.object({
  config: z.string().optional(),
  target: z.string().optional(),
  envPath: z.string().optional(),
  verbose: z.boolean().optional(),
  preview: z.boolean().optional(),
  turns: z.number().optional(),
});

type Args = z.infer<typeof ArgsSchema>;

/**
 * Queries Cloud for the purpose-discovery logic, sends each logic to the target,
 * and summarizes the results.
 *
 * @param target - The target API provider.
 * @param maxTurns - The maximum number of turns to run the discovery process.
 * @returns The purpose of the target.
 */
export async function doTargetPurposeDiscovery(
  target: ApiProvider,
  maxTurns?: number,
): Promise<string> {
  logger.info('Discovering purpose...');

  const conversationHistory: { type: 'promptfoo' | 'target'; content: string }[] = [];

  let turnCounter = 1;

  const pbar = new cliProgress.SingleBar({
    format: `Discovering purpose {bar} {percentage}% | {value}/${maxTurns ? '{total}' : '∞'} turns'}`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });

  pbar.start(
    maxTurns ??
      // fallback: estimate of 25 turns
      25,
    0,
  );

  while (true) {
    const res = await fetch(getRemoteGenerationUrl(), {
      body: JSON.stringify({
        task: 'target-purpose-discovery',
        conversationHistory,
        maxTurns,
        version: VERSION,
        email: getUserEmail(),
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const { done, question, purpose } = (await res.json()) as {
      done: boolean;
      question?: string;
      purpose?: string;
    };

    if (done) {
      if (pbar) {
        pbar.increment();
        pbar.stop();
      }
      logger.info(`\nPurpose:\n\n${chalk.green(purpose)}\n`);
      return purpose as string;
    } else {
      if (!question) {
        logger.error(`Failed to discover purpose: ${res.statusText}`);
        process.exit(1);
      }
      conversationHistory.push({ type: 'promptfoo', content: question as string });
    }

    // Call the target with the question:
    const response = await target.callApi(question as string);
    logger.debug(JSON.stringify({ question, output: response.output }, null, 2));
    conversationHistory.push({ type: 'target', content: response.output });

    if (maxTurns && turnCounter === maxTurns) {
      return purpose as string;
    }

    turnCounter++;
    if (pbar) {
      pbar.increment();
    }
  }
}

/**
 * Saves the purpose to the database.
 *
 * @param targetId - The target ID.
 * @param purpose - The purpose.
 * @returns The response from the database.
 */
async function savePurpose(targetId: string, purpose: string) {
  let apiDomain: string | undefined;
  const apiBaseUrl = getEnvString('PROMPTFOO_REMOTE_API_BASE_URL');

  if (apiBaseUrl) {
    apiDomain = apiBaseUrl;
  } else {
    invariant(
      cloudConfig.isEnabled(),
      'Cloud config should have been enabled for a target to be provided',
    );
    apiDomain = cloudConfig.getApiHost();
  }

  const url = `${apiDomain!}/api/v1/providers/${targetId}`;

  logger.debug(`Saving purpose to ${url}`);

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cloudConfig.getApiKey()}`,
    },
    body: JSON.stringify({ applicationDescription: { purpose } }),
  });

  if (res.ok) {
    logger.info('Purpose updated');
  } else {
    logger.error(`Failed to save purpose to database: ${res.statusText}`);
  }
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
    .addOption(
      new Option(
        '--turns <turns>',
        'A maximum number of turns to run the discovery process. Lower is faster but less accurate.',
      ).argParser(Number.parseInt),
    )

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

      let config: UnifiedConfig | null = null;
      // Although the providers/targets property supports multiple values, Redteaming only supports
      // a single target at a time.
      let target: ApiProvider | undefined = undefined;

      // If user provides a config, read the target from it:
      if (args.config) {
        config = await readConfig(args.config);
        invariant(config, 'An error occurred loading the config');
        invariant(config.providers, 'Config must contain targets or providers');
        const providers = await loadApiProviders(config.providers);
        target = providers[0];
      }
      // If the target flag is provided, load it from Cloud:
      else if (args.target) {
        // Let the internal error handling bubble up:
        const providerOptions = await getProviderFromCloud(args.target);
        target = await loadApiProvider(providerOptions.id, { options: providerOptions });
      }
      // A config or a target must be provided:
      else {
        logger.error(
          'A config (-c, --config <path>) or a target (-t, --target <id>) must be provided!\n',
        );
        process.exitCode = 1;
        return;
      }

      // At this point, we should have at least one target:
      invariant(target != undefined, 'An error occurred loading the target config');

      // Discover the purpose for the target:
      let purpose: string | undefined = undefined;
      try {
        purpose = await doTargetPurposeDiscovery(target, args.turns);
      } catch (error) {
        logger.error(
          `An unexpected error occurred during target discovery: ${error instanceof Error ? error.message : String(error)}\n${
            error instanceof Error ? error.stack : ''
          }`,
        );
        process.exitCode = 1;
        return;
      }

      // Then, handle the response:
      // If preview is enabled, print the purpose to the console:
      if (!args.preview) {
        // Persist the purposes:
        if (args.target) {
          await savePurpose(args.target, purpose);
        } else {
          invariant(config, 'Config is required');

          // Set the `purpose` property on the provider:
          // This conditional logic is LLM-generated magic...
          // it might be the only place where the `promptfooconfig.yaml` is modified in place – so don't touch it!
          if (typeof config.providers === 'string') {
            // If providers is a string, convert to ProviderOptions object
            config.providers = [{ id: config.providers, purpose } as any];
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
