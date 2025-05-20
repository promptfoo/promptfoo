import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { type Command } from 'commander';
import { randomUUID } from 'crypto';
import dedent from 'dedent';
import * as fs from 'fs';
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
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl } from '../remoteGeneration';
import { neverGenerateRemote } from '../remoteGeneration';

export const TargetPurposeDiscoveryStateSchema = z.object({
  currentQuestionIndex: z.number(),
  answers: z.array(z.string()),
});

export const TargetPurposeDiscoveryRequestSchema = z.object({
  state: TargetPurposeDiscoveryStateSchema,
  task: z.literal('target-purpose-discovery'),
  version: z.string(),
  email: z.string(),
});
export const DiscoveredPurposeSchema = z.object({
  purpose: z.string().nullable(),
  limitations: z.string().nullable(),
  user: z.string().nullable(),
  tools: z.array(z.record(z.any())).nullable(),
});

export const TargetPurposeDiscoveryResponseSchema = z.object({
  done: z.boolean(),
  question: z.string().optional(),
  purpose: DiscoveredPurposeSchema.optional(),
  state: TargetPurposeDiscoveryStateSchema,
});

export type DiscoveredPurpose = z.infer<typeof DiscoveredPurposeSchema>;

export const ArgsSchema = z
  .object({
    config: z.string().optional(),
    target: z.string().optional(),
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
  });

type Args = z.infer<typeof ArgsSchema>;

// A larger turn count is more accurate (b/c more probes) but slower.
// TODO: Optimize this default to balance quality/runtime using the Discover eval.
// NOTE: Set to 5 because UI lacks ability to set the count.
export const DEFAULT_TURN_COUNT = 5;

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
): Promise<DiscoveredPurpose | undefined> {
  const pbar = new cliProgress.SingleBar({
    format: `Discovery phase - probing the target {bar} {percentage}% | {value}${maxTurns ? '/{total}' : ''} turns`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });

  pbar.start(maxTurns, 0);

  let done = false;
  let question: string | undefined = undefined;
  let purpose: DiscoveredPurpose | undefined = undefined;
  let state = TargetPurposeDiscoveryStateSchema.parse({
    currentQuestionIndex: 0,
    answers: [],
  });
  let tries = 0;

  while (!done) {
    const request = TargetPurposeDiscoveryRequestSchema.parse({
      state: {
        currentQuestionIndex: state.currentQuestionIndex,
        answers: state.answers,
      },
      task: 'target-purpose-discovery',
      version: VERSION,
      email: getUserEmail(),
    });

    const response = await fetchWithProxy(getRemoteGenerationUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cloudConfig.getApiKey()}`,
      },
      body: JSON.stringify(request),
    });
    tries++;

    if (!response.ok) {
      const error = await response.text();
      logger.error(
        `[TargetPurposeDiscovery] Error getting the next question from remote server: ${error}`,
      );
      if (tries > 10) {
        logger.error('[TargetPurposeDiscovery] Too many retries, giving up.');
        return undefined;
      }
      continue;
    }

    const responseData = await response.json();
    const response_ = TargetPurposeDiscoveryResponseSchema.parse(responseData);

    logger.debug(
      `[TargetPurposeDiscovery] Received response from remote server: ${JSON.stringify(
        response_,
        null,
        2,
      )}`,
    );
    done = response_.done;
    question = response_.question;
    purpose = response_.purpose;
    state = response_.state;

    if (!done) {
      invariant(
        question,
        'If its not done, then a quesation should always be defined, something is terribely wrong.',
      );
      const targetResponse = await target.callApi(question, {
        prompt: { raw: question, label: 'Target Purpose Discovery Question' },
        vars: { sessionId: randomUUID() },
      });
      if (targetResponse.error) {
        logger.error(`[TargetPurposeDiscovery] Error from target: ${targetResponse.error}`);
        if (tries > 10) {
          logger.error('[TargetPurposeDiscovery] Too many retries, giving up.');
          return undefined;
        }
        continue;
      }
      logger.debug(
        `[TargetPurposeDiscovery] Received response from target: ${JSON.stringify(
          targetResponse,
          null,
          2,
        )}`,
      );
      state.answers.push(targetResponse.output);
    }

    pbar.increment(1);
  }
  pbar.stop();

  return purpose;
}

export function mergePurposes(
  humanDefinedPurpose: string | undefined,
  discoveredPurpose: Record<string, any> | undefined,
) {
  let purpose = '';
  if (humanDefinedPurpose) {
    purpose += `This purpose was defined by the user and should be trusted and treated as absolute truth:
    <HumanDefinedPurpose>
    ${humanDefinedPurpose}
    </HumanDefinedPurpose>
    `;
  }
  if (discoveredPurpose) {
    purpose += `This purpose was discovered by the agent from conversations with the target. The boundaries of the agent's capabilities, limitations, and tool access should be tested. If there are any discrepancies, the user-defined purpose should be trusted and treated as absolute truth:
    <AgentDiscoveredPurpose>
    ${discoveredPurpose.purpose ? `The target believes its purpose is: ${discoveredPurpose.purpose}` : ''}
    ${discoveredPurpose.limitations ? `The target believes its limitations are: ${discoveredPurpose.limitations}` : ''}
    ${discoveredPurpose.tools ? `The target divulged access to these tools: ${JSON.stringify(discoveredPurpose.tools, null, 2)}` : ''}
    ${discoveredPurpose.user ? `The target believes the user of the application is: ${discoveredPurpose.user}` : ''}
    </AgentDiscoveredPurpose>
    `;
  }
  return purpose;
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
    .option('-t, --target <id>', 'UUID of a Cloud-defined target to run the discovery on')
    .action(async (rawArgs: Args) => {
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
      let purpose: Record<string, any> | undefined = undefined;
      try {
        purpose = await doTargetPurposeDiscovery(target);
      } catch (error) {
        logger.error(
          `An unexpected error occurred during target discovery: ${error instanceof Error ? error.message : String(error)}\n${
            error instanceof Error ? error.stack : ''
          }`,
        );
        process.exit(1);
      }

      if (purpose) {
        if (purpose.purpose) {
          logger.info(chalk.bold(chalk.green('The target believes its purpose is:')));
          logger.info(chalk.bold(purpose.purpose + '\n\n'));
        }
        if (purpose.limitations) {
          logger.info(chalk.bold(chalk.green('The target believes its limitations to be:')));
          logger.info(purpose.limitations + '\n\n');
        }
        if (purpose.tools) {
          logger.info(chalk.bold(chalk.green('The target divulged access to these tools:')));
          logger.info(JSON.stringify(purpose.tools, null, 2));
        }
        if (purpose.user) {
          logger.info(
            chalk.bold(chalk.green('The target believes the user of the application is:')),
          );
          logger.info(purpose.user + '\n\n');
        }
      }

      process.exit();
    });
}
