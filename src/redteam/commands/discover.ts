import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { type Command } from 'commander';
import { randomUUID } from 'crypto';
import dedent from 'dedent';
import * as fs from 'fs';
import { z } from 'zod';
import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { fetchWithProxy } from '../../fetch';
import { getUserEmail } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { loadApiProvider, loadApiProviders } from '../../providers';
import telemetry from '../../telemetry';
import type { ApiProvider, Prompt, UnifiedConfig } from '../../types';
import { getProviderFromCloud } from '../../util/cloud';
import { readConfig } from '../../util/config/load';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

// ========================================================
// Schemas
// ========================================================

export const TargetPurposeDiscoveryStateSchema = z.object({
  currentQuestionIndex: z.number(),
  answers: z.array(z.string()),
});

export const TargetPurposeDiscoveryRequestSchema = z.object({
  state: TargetPurposeDiscoveryStateSchema,
  task: z.literal('target-purpose-discovery'),
  version: z.string(),
  email: z.string().optional().nullable(),
});

export const TargetPurposeDiscoveryResultSchema = z.object({
  purpose: z.string().nullable(),
  limitations: z.string().nullable(),
  user: z.string().nullable(),
  tools: z.array(
    z
      .object({
        name: z.string(),
        description: z.string(),
        arguments: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            type: z.string(),
          }),
        ),
      })
      .nullable(),
  ),
});

export const TargetPurposeDiscoveryTaskResponseSchema = z.object({
  done: z.boolean(),
  question: z.string().optional(),
  purpose: TargetPurposeDiscoveryResultSchema.optional(),
  state: TargetPurposeDiscoveryStateSchema,
  error: z.string().optional(),
});

export const ArgsSchema = z
  .object({
    config: z.string().optional(),
    target: z.string().optional(),
  })
  // Config and target are mutually exclusive:
  .refine((data) => !(data.config && data.target), {
    message: 'Cannot specify both config and target!',
    path: ['config', 'target'],
  });

// ========================================================
// Types
// ========================================================

export type TargetPurposeDiscoveryResult = z.infer<typeof TargetPurposeDiscoveryResultSchema>;

type Args = z.infer<typeof ArgsSchema>;

// ========================================================
// Constants
// ========================================================

export const DEFAULT_TURN_COUNT = 5;
export const MAX_TURN_COUNT = 10;
const LOG_PREFIX = '[Target Discovery Agent]';
const COMMAND = 'discover';

// ========================================================
// Utils
// ========================================================

// Helper function to check if a string value should be considered null
const isNullLike = (value: string | null | undefined): boolean => {
  return !value || value === 'null' || value.trim() === '';
};

// Helper function to clean tools array
const cleanTools = (tools: Array<any> | null | undefined): Array<any> => {
  if (!tools || !Array.isArray(tools)) {
    return [];
  }
  return tools.filter((tool) => tool !== null && typeof tool === 'object');
};

/**
 * Normalizes a TargetPurposeDiscoveryResult by converting null-like values to actual null
 * and cleaning up empty or meaningless content.
 */
export function normalizeTargetPurposeDiscoveryResult(
  result: TargetPurposeDiscoveryResult,
): TargetPurposeDiscoveryResult {
  return {
    purpose: isNullLike(result.purpose) ? null : result.purpose,
    limitations: isNullLike(result.limitations) ? null : result.limitations,
    user: isNullLike(result.user) ? null : result.user,
    tools: cleanTools(result.tools),
  };
}

/**
 * Queries Cloud for the purpose-discovery logic, sends each logic to the target,
 * and summarizes the results.
 *
 * @param target - The target API provider.
 * @param prompt - The prompt to use for the discovery.
 * @param showProgress - Whether to show the progress bar.
 * @returns The discovery result.
 */
export async function doTargetPurposeDiscovery(
  target: ApiProvider,
  prompt?: Prompt,
  showProgress: boolean = true,
): Promise<TargetPurposeDiscoveryResult | undefined> {
  // Generate a unique session id to pass to the target across all turns.
  const sessionId = randomUUID();

  let pbar: cliProgress.SingleBar | undefined;
  if (showProgress) {
    pbar = new cliProgress.SingleBar({
      format: `Mapping the target {bar} {percentage}% | {value}${DEFAULT_TURN_COUNT ? '/{total}' : ''} turns`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      gracefulExit: true,
    });

    pbar.start(DEFAULT_TURN_COUNT, 0);
  }

  let done = false;
  let question: string | undefined;
  let discoveryResult: TargetPurposeDiscoveryResult | undefined;
  let state = TargetPurposeDiscoveryStateSchema.parse({
    currentQuestionIndex: 0,
    answers: [],
  });
  let turn = 0;

  while (!done && turn < MAX_TURN_COUNT) {
    try {
      turn++;

      logger.debug(`${LOG_PREFIX} Discovery loop turn: ${turn}`);

      const response = await fetchWithProxy(getRemoteGenerationUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cloudConfig.getApiKey()}`,
        },
        body: JSON.stringify(
          TargetPurposeDiscoveryRequestSchema.parse({
            state: {
              currentQuestionIndex: state.currentQuestionIndex,
              answers: state.answers,
            },
            task: 'target-purpose-discovery',
            version: VERSION,
            email: getUserEmail(),
          }),
        ),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error(`${LOG_PREFIX} Error getting the next question from remote server: ${error}`);
        continue;
      }

      const responseData = await response.json();
      const data = TargetPurposeDiscoveryTaskResponseSchema.parse(responseData);

      logger.debug(
        `${LOG_PREFIX} Received response from remote server: ${JSON.stringify(data, null, 2)}`,
      );

      done = data.done;
      question = data.question;
      discoveryResult = data.purpose;
      state = data.state;

      if (data.error) {
        const errorMessage = `Error from remote server: ${data.error}`;
        logger.error(`${LOG_PREFIX} ${errorMessage}`);
        throw new Error(errorMessage);
      }
      // Should another question be asked?
      else if (!done) {
        invariant(question, 'Question should always be defined if `done` is falsy.');

        const renderedPrompt = prompt
          ? await renderPrompt(prompt, { prompt: question }, {}, target)
          : question;

        const targetResponse = await target.callApi(renderedPrompt, {
          prompt: { raw: question, label: 'Target Discovery Question' },
          vars: { sessionId },
          bustCache: true,
        });

        if (targetResponse.error) {
          const errorMessage = `Error from target: ${targetResponse.error}`;
          logger.error(`${LOG_PREFIX} ${errorMessage}`);
          throw new Error(errorMessage);
        }

        if (turn > MAX_TURN_COUNT) {
          const errorMessage = `Too many retries, giving up.`;
          logger.error(`${LOG_PREFIX} ${errorMessage}`);
          throw new Error(errorMessage);
        }

        logger.debug(
          `${LOG_PREFIX} Received response from target: ${JSON.stringify(targetResponse, null, 2)}`,
        );

        state.answers.push(targetResponse.output);
      }
    } finally {
      if (showProgress) {
        pbar?.increment(1);
      }
    }
  }
  if (showProgress) {
    pbar?.stop();
  }

  return discoveryResult ? normalizeTargetPurposeDiscoveryResult(discoveryResult) : undefined;
}

// ========================================================
// Command
// ========================================================

/**
 * Registers the `discover` command with the CLI.
 */
export function discoverCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command(COMMAND)
    .description(
      dedent`
        Run the Target Discovery Agent to automatically discover and report a target application's purpose,
        limitations, and tools, enhancing attack probe efficacy.

        If neither a config file nor a target ID is provided, the current working directory will be checked for a promptfooconfig.yaml file,
        and the first provider in that config will be used.
      `,
    )
    .option('-c, --config <path>', 'Path to `promptfooconfig.yaml` configuration file.')
    .option('-t, --target <id>', 'UUID of a target defined in Promptfoo Cloud to scan.')
    .action(async (rawArgs: Args) => {
      // Check that remote generation is enabled:
      if (neverGenerateRemote()) {
        logger.error(dedent`
          Target discovery relies on remote generation which is disabled.

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
        name: `redteam ${COMMAND}`,
      });

      let config: UnifiedConfig | null = null;
      // Although the providers/targets property supports multiple values, Redteaming only supports
      // a single target at a time.
      let target: ApiProvider | undefined = undefined;
      // Fallback to the default config path:

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
          throw new Error('Config must contain a target');
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
      else if (defaultConfig) {
        if (!defaultConfig) {
          throw new Error(`Config is invalid at ${defaultConfigPath}`);
        }

        if (!defaultConfig.providers) {
          throw new Error('Config must contain a target or provider');
        }

        const providers = await loadApiProviders(defaultConfig.providers);
        target = providers[0];

        // Alert the user that we're using a config from the current working directory:
        logger.info(`Using config from ${chalk.italic(defaultConfigPath)}`);
      } else {
        logger.error(
          'No config found, please specify a config file with the --config flag, a target with the --target flag, or run this command from a directory with a promptfooconfig.yaml file.',
        );
        process.exitCode = 1;
        return;
      }

      try {
        const discoveryResult = await doTargetPurposeDiscovery(target);

        if (discoveryResult) {
          if (discoveryResult.purpose) {
            logger.info(chalk.bold(chalk.green('\n1. The target believes its purpose is:\n')));
            logger.info(discoveryResult.purpose);
          }
          if (discoveryResult.limitations) {
            logger.info(
              chalk.bold(chalk.green('\n2. The target believes its limitations to be:\n')),
            );
            logger.info(discoveryResult.limitations);
          }
          if (discoveryResult.tools && discoveryResult.tools.length > 0) {
            logger.info(
              chalk.bold(chalk.green('\n3. The target divulged access to these tools:\n')),
            );
            logger.info(JSON.stringify(discoveryResult.tools, null, 2));
          }
          if (discoveryResult.user) {
            logger.info(
              chalk.bold(chalk.green('\n4. The target believes the user of the application is:\n')),
            );
            logger.info(discoveryResult.user);
          }

          // If no meaningful information was discovered, inform the user
          if (
            !discoveryResult.purpose &&
            !discoveryResult.limitations &&
            (!discoveryResult.tools || discoveryResult.tools.length === 0) &&
            !discoveryResult.user
          ) {
            logger.info(
              chalk.yellow('\nNo meaningful information was discovered about the target.'),
            );
          }
        }
      } catch (error) {
        logger.error(
          `An unexpected error occurred during target scan: ${error instanceof Error ? error.message : String(error)}\n${
            error instanceof Error ? error.stack : ''
          }`,
        );
        process.exit(1);
      }

      process.exit();
    });
}
