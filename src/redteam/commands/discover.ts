import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { type Command, Option } from 'commander';
import dedent from 'dedent';
import * as fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { z } from 'zod';
import { VERSION } from '../../constants';
import { fetchWithProxy } from '../../fetch';
import { getUserEmail } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { loadApiProvider, loadApiProviders } from '../../providers';
import telemetry from '../../telemetry';
import type { ApiProvider, UnifiedConfig } from '../../types';
import { getProviderFromCloud } from '../../util/cloud';
import { readConfig } from '../../util/config/load';
import { writePromptfooConfig } from '../../util/config/manage';
import invariant from '../../util/invariant';
import { DEFAULT_OUTPUT_PATH } from '../constants';
import { getRemoteGenerationUrl } from '../remoteGeneration';
import { neverGenerateRemote } from '../remoteGeneration';

export const ArgsSchema = z
  .object({
    config: z.string().optional(),
    output: z.string().optional(),
    target: z.string().optional(),
    preview: z.boolean(),
    turns: z.number().optional(),
    overwrite: z.boolean(),
  })
  // Config and target are mutually exclusive:
  .refine((data) => !(data.config && data.target), {
    message: 'Cannot specify both config and target!',
    path: ['config', 'target'],
  })
  // Either config or target must be provided:
  .refine((data) => data.config || data.target, {
    message: 'Either config or target must be provided!',
    path: ['config', 'target'],
  })
  // `output` and `preview` are mutually exclusive:
  .refine((data) => !(data.output && data.preview), {
    message: 'Cannot specify both output and preview!',
    path: ['output', 'preview'],
  })
  // `overwrite` can only be used if `output` is provided:
  .refine((data) => !(data.overwrite && !data.output), {
    message: 'Cannot specify overwrite without output!',
    path: ['overwrite', 'output'],
  })
  // if `preview` is false, `output` must be provided:
  .refine((data) => !(data.preview === false && !data.output), {
    message: 'If preview is false, output must be provided!',
    path: ['preview', 'output'],
  });

type Args = z.infer<typeof ArgsSchema>;

type ConversationHistory = { type: 'promptfoo' | 'target'; content: string }[];

// A larger turn count is more accurate (b/c more probes) but slower.
// TODO: Optimize this default to balance quality/runtime using the Discover eval.
// NOTE: Set to 5 because UI lacks ability to set the count.
const DEFAULT_TURN_COUNT = 5;

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
  maxTurns: number = DEFAULT_TURN_COUNT,
): Promise<{ purpose: string; conversationHistory: ConversationHistory }> {
  const conversationHistory: ConversationHistory = [];

  const pbar = new cliProgress.SingleBar({
    format: `Discovering purpose {bar} {percentage}% | {value}${maxTurns ? '/{total}' : ''} turns`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });

  pbar.start(maxTurns, 0);

  for (let i = 1; i <= maxTurns; i++) {
    // Fetch the {initial | next} question from the server:
    const res = await fetchWithProxy(getRemoteGenerationUrl(), {
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

    // `done` will be true if max turns are reached (server is aware of the turn count) OR the server
    // is satisfied with the current purpose.
    if (
      done ||
      // `done` should never not be `true` here, but it's good to have a fallback:
      i === maxTurns
    ) {
      // Finalize the progress bar:
      pbar.increment();
      pbar.stop();

      // Handle the edge case where the server did not call `done` when max turns are reached:
      if (purpose) {
        logger.info(`\nPurpose:\n\n${chalk.green(purpose)}\n`);
        return { purpose: purpose as string, conversationHistory };
      } else {
        throw new Error(
          'Failed to discover purpose: server did not call `done` when max turns are reached',
        );
      }
    } else {
      if (!question) {
        throw new Error(`Failed to discover purpose: ${res.statusText}`);
      }

      // Add the promptfoo question to the conversation history:
      conversationHistory.push({ type: 'promptfoo', content: question as string });

      // Call the target with the question:
      const response = await target.callApi(question as string);
      logger.debug(JSON.stringify({ question, output: response.output }, null, 2));
      conversationHistory.push({ type: 'target', content: response.output });

      pbar.increment();
    }
  }

  throw new Error('Failed to discover purpose: max turns reached');
}

/**
 * For targets hosted on Cloud, save the purpose to the database.
 *
 * @param targetId - The target ID.
 * @param purpose - The purpose.
 * @returns The response from the database.
 */
async function saveCloudTargetPurpose(targetId: string, purpose: string) {
  invariant(
    cloudConfig.isEnabled(),
    'Cloud config should have been enabled for a target to be provided',
  );
  const url = `${cloudConfig.getApiHost()}/api/v1/providers/${targetId}`;

  logger.debug(`Saving purpose to ${url}`);

  const res = await fetchWithProxy(url, {
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

export function mergePurposes(humanDefinedPurpose: string, discoveredPurpose: string) {
  return `${humanDefinedPurpose}\n\nDiscovered Purpose:\n\n${discoveredPurpose}`;
}

/**
 * Registers the `discover` command with the CLI.
 */
export function discoverCommand(program: Command) {
  program
    .command('discover')
    .description(
      dedent`
        Automatically discover a target application's purpose, enhancing attack probe efficacy.

        If neither a config file nor a target ID is provided, the current working directory will be checked for a promptfooconfig.yaml file,
        and the target will be discovered from the first provider in that config.
      `,
    )
    .option('-c, --config <path>', 'Path to `promptfooconfig.yaml` configuration file.')
    .option(
      '-o, --output <path>',
      'Path to output file. Discovered purpose will be appended to the file if it already exists.',
      DEFAULT_OUTPUT_PATH,
    )
    .option('--overwrite', 'Overwrite the existing purpose if it already exists.', false)
    .option('-t, --target <id>', 'UUID of a Cloud-defined target to run the discovery on')
    .option('--preview', 'Preview discovery results without writing to an output file', false)
    .option(
      '--turns <turns>',
      'A maximum number of turns to run the discovery process. Lower is faster but less accurate.',
      (value) => Number.parseInt(value),
      DEFAULT_TURN_COUNT,
    )
    .action(async (rawArgs: Args) => {
      // If preview is true and output is DEFAULT_OUTPUT_PATH, set output to undefined to satisfy
      // the schema. Defaults are defined within the `option` definitions to include them within the
      // help message; however the schema enforces combinations of options that are mutually exclusive,
      // such as `output` and `preview`.
      if (rawArgs.preview && rawArgs.output === DEFAULT_OUTPUT_PATH) {
        rawArgs.output = undefined;
      }

      // Check that remote generation is enabled:
      if (neverGenerateRemote()) {
        logger.error(dedent`
          Discovery relies on remote generation which is disabled.

          To enable remote generation, unset the PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION environment variable.
        `);
        process.exit(1);
      }

      // Validate the arguments:
      const { success, data: args, error } = ArgsSchema.safeParse(rawArgs);
      if (!success) {
        logger.error('Invalid options:');
        error.issues.forEach((issue) => {
          logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
        });
        process.exitCode = 1;
        return;
      }

      // Record telemetry:
      telemetry.record('command_used', {
        name: 'redteam discover',
      });

      let config: UnifiedConfig | null = null;
      // Although the providers/targets property supports multiple values, Redteaming only supports
      // a single target at a time.
      let target: ApiProvider | undefined = undefined;
      // Fallback to the default config path:
      const fallbackConfigPath = path.join(process.cwd(), 'promptfooconfig.yaml');

      // If user provides a config, read the target from it:
      if (args.config) {
        // Validate that the config is a valid path:
        if (!fs.existsSync(args.config)) {
          throw new Error(`Config not found at ${args.config}`);
        }

        config = await readConfig(args.config);

        if (!config) {
          throw new Error(`Config is invalid at ${args.config}`);
        }

        if (!config.providers) {
          throw new Error('Config must contain at least one target or provider');
        }

        const providers = await loadApiProviders(config.providers);
        target = providers[0];
      }
      // If the target flag is provided, load it from Cloud:
      else if (args.target) {
        // Let the internal error handling bubble up:
        const providerOptions = await getProviderFromCloud(args.target);
        target = await loadApiProvider(providerOptions.id, { options: providerOptions });
      }
      // Check the current working directory for a promptfooconfig.yaml file:
      else if (fs.existsSync(fallbackConfigPath)) {
        config = await readConfig(fallbackConfigPath);

        if (!config) {
          throw new Error(`Config is invalid at ${fallbackConfigPath}`);
        }

        if (!config.providers) {
          throw new Error('Config must contain at least one target or provider');
        }

        const providers = await loadApiProviders(config.providers);
        target = providers[0];

        // Alert the user that we're using a config from the current working directory:
        logger.info(`Using config from ${chalk.italic(fallbackConfigPath)}`);
      }

      // At this point, we should have at least one target:
      invariant(target != undefined, 'An error occurred loading the target config');

      // Discover the purpose for the target:
      let purpose: string | undefined = undefined;
      try {
        const result = await doTargetPurposeDiscovery(target, args.turns);
        purpose = result.purpose;
      } catch (error) {
        logger.error(
          `An unexpected error occurred during target discovery: ${error instanceof Error ? error.message : String(error)}\n${
            error instanceof Error ? error.stack : ''
          }`,
        );
        process.exit(1);
      }

      // If not previewing, persist the purposes:
      if (!args.preview) {
        // Persist the purposes:
        if (args.target) {
          await saveCloudTargetPurpose(args.target, purpose);
        } else {
          invariant(config, 'Config is required');

          if (args.output === DEFAULT_OUTPUT_PATH) {
            args.output = path.relative(process.cwd(), DEFAULT_OUTPUT_PATH);
          }

          logger.debug(`Writing purpose to ${args.output}`);

          if (fs.existsSync(args.output!)) {
            const existingYaml = yaml.load(
              fs.readFileSync(args.output!, 'utf8'),
            ) as Partial<UnifiedConfig>;

            // Either append or overwrite the existing purpose:
            const existingPurpose = existingYaml['redteam']?.purpose;

            if (existingPurpose) {
              if (args.overwrite) {
                logger.warn(dedent`
                  Output file already contains a value at \`redteam.purpose\`; overwriting it.
                `);
              } else {
                logger.warn(dedent`
                  Output file already contains a value at \`redteam.purpose\`; appending discovered purpose to it.

                  To overwrite the existing purpose, use the \`--overwrite\` flag.
                `);
              }
            }

            existingYaml['redteam'] = {
              ...(existingYaml['redteam'] || {}),
              purpose:
                existingPurpose && !args.overwrite
                  ? mergePurposes(existingPurpose, purpose)
                  : purpose,
            };
            writePromptfooConfig(existingYaml as UnifiedConfig, args.output!);
          } else {
            // Create a new config file with the purpose.
            writePromptfooConfig({ redteam: { purpose } } as UnifiedConfig, args.output!);
          }

          logger.info(`\nPurpose written to ${chalk.italic(args.output)}`);
        }
      }
    });
}
