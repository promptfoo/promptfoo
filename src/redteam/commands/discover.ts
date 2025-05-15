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
import telemetry from '../../telemetry';
import type { ApiProvider, UnifiedConfig } from '../../types';
import { findTargetProvider } from '../../util/config/load';
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

const DEFAULT_TURN_COUNT = 50;

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
): Promise<string> {
  const conversationHistory: { type: 'promptfoo' | 'target'; content: string }[] = [];

  let turnCounter = 1;

  const pbar = new cliProgress.SingleBar({
    format: `Discovering purpose {bar} {percentage}% | {value}${maxTurns ? '/{total}' : ''} turns`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });

  pbar.start(maxTurns, turnCounter);

  while (true) {
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

    if (done) {
      pbar.increment();
      pbar.stop();
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

    if (turnCounter === maxTurns) {
      // Purpose will always be defined because the generator task is max turn aware.
      return purpose as string;
    } else {
      turnCounter++;
      pbar.increment();
    }
  }
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

/**
 * Registers the `discover` command with the CLI.
 */
export function discoverCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig> = {},
  defaultConfigPath?: string,
) {
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
    .addOption(
      new Option(
        '--turns <turns>',
        'A maximum number of turns to run the discovery process. Lower is faster but less accurate.',
      )
        .argParser(Number.parseInt)
        .default(DEFAULT_TURN_COUNT),
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

      // Find the target provider
      const { target, config, usedConfigPath } = await findTargetProvider({
        configPath: args.config,
        targetId: args.target,
        defaultConfigPath
      });

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

      // If not previewing, persist the purposes:
      if (!args.preview) {
        // Persist the purposes:
        if (args.target) {
          await saveCloudTargetPurpose(args.target, purpose);
        } else {
          invariant(config, 'Config is required');

          // Use the output path or the config file path if no output was specified
          const outputPath = args.output || usedConfigPath;
          if (!outputPath) {
            logger.error('No output path specified and no usable config path found');
            process.exitCode = 1;
            return;
          }

          if (args.output === DEFAULT_OUTPUT_PATH) {
            args.output = path.relative(process.cwd(), DEFAULT_OUTPUT_PATH);
          }

          logger.debug(`Writing purpose to ${outputPath}`);

          if (fs.existsSync(outputPath)) {
            const existingYaml = yaml.load(
              fs.readFileSync(outputPath, 'utf8'),
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
                  ? `${existingPurpose}\n\nDiscovered Purpose:\n\n${purpose}`
                  : purpose,
            };
            writePromptfooConfig(existingYaml as UnifiedConfig, outputPath);
          } else {
            // Create a new config file with the purpose.
            writePromptfooConfig({ redteam: { purpose } } as UnifiedConfig, outputPath);
          }

          logger.info(`\nPurpose written to ${chalk.italic(outputPath)}`);
        }
      }
    });
}
