import { randomUUID } from 'crypto';
import * as fs from 'fs';

import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { type Command } from 'commander';
import dedent from 'dedent';
import ora from 'ora';
import { io, type Socket } from 'socket.io-client';
import { z } from 'zod';
import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger, { isDebugEnabled } from '../../logger';
import { HttpProvider } from '../../providers/http';
import { loadApiProvider, loadApiProviders } from '../../providers/index';
import telemetry from '../../telemetry';
import { getProviderFromCloud } from '../../util/cloud';
import { readConfig } from '../../util/config/load';
import { fetchWithProxy } from '../../util/fetch/index';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

import type { ApiProvider, Prompt, UnifiedConfig } from '../../types/index';

// ========================================================
// Schemas
// ========================================================

const TargetPurposeDiscoveryStateSchema = z.object({
  currentQuestionIndex: z.number(),
  answers: z.array(z.any()),
});

export const TargetPurposeDiscoveryRequestSchema = z.object({
  state: TargetPurposeDiscoveryStateSchema,
  task: z.literal('target-purpose-discovery'),
  version: z.string(),
  email: z.string().optional().nullable(),
});

const TargetPurposeDiscoveryResultSchema = z.object({
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

const DEFAULT_TURN_COUNT = 5;
const MAX_TURN_COUNT = 10;
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

        // If the target is an HTTP provider and has no transformResponse defined, and the response is an object,
        // prompt the user to define a transformResponse.
        if (
          target instanceof HttpProvider &&
          target.config.transformResponse === undefined &&
          typeof targetResponse.output === 'object' &&
          targetResponse.output !== null
        ) {
          logger.warn(
            `${LOG_PREFIX} Target response is an object; should a \`transformResponse\` function be defined?`,
          );
        }

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
// Socket-based Discovery (for cloud targets)
// ========================================================

/**
 * Event payloads for discovery socket communication
 */
interface DiscoveryProbePayload {
  requestId: string;
  prompt: string;
}

interface DiscoverySessionJoinedPayload {
  sessionId: string;
  targetId: string;
}

interface DiscoveryCompletedPayload {
  output?: {
    applicationDescription: Record<string, string>;
    plugins: Array<{ id: string; reason: string }>;
    strategies: Array<{ id: string; reason: string }>;
  };
}

interface DiscoveryErrorPayload {
  error: string;
}

interface DiscoveryCancelledPayload {
  source: 'ui' | 'cli';
}


/**
 * Create socket connection to the /suggest namespace
 */
async function createDiscoverySocket(apiHost: string, apiKey: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    logger.debug(`[Discovery] Connecting to ${apiHost}/suggest...`);
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.io.reconnection(false);
      socket.removeAllListeners();
      socket.close();
    };

    const socket = io(`${apiHost}/suggest`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 5,
      auth: { apiKey },
    });

    socket.on('connect', () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      logger.debug(`[Discovery] Socket connected (id: ${socket.id})`);
      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      logger.debug(`[Discovery] Socket connection error: ${error.message}`);
      cleanup();
      reject(new Error(`Failed to connect to server: ${error.message}`));
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`[Discovery] Socket disconnected: ${reason}`);
    });

    socket.on('error', (error) => {
      logger.debug(`[Discovery] Socket error: ${String(error)}`);
    });

    const timeoutId = setTimeout(() => {
      if (!socket.connected && !settled) {
        settled = true;
        cleanup();
        reject(new Error('Connection timeout after 5 seconds'));
      }
    }, 5000);
  });
}

/**
 * Run socket-based discovery for a cloud-defined target
 *
 * This function connects to the cloud server via Socket.IO and acts as a
 * bridge between the server and the local target. The server sends probe
 * requests, the CLI executes them locally, and sends results back.
 *
 * @param target - The loaded API provider for the target
 * @param targetId - The cloud target ID
 * @param showProgress - Whether to show progress messages
 * @returns Discovery result or undefined if cancelled/failed
 */
export async function doSocketBasedDiscovery(
  target: ApiProvider,
  targetId: string,
  showProgress: boolean = true,
): Promise<{ success: boolean; error?: string } | undefined> {
  const apiHost = cloudConfig.getApiHost();
  const apiKey = cloudConfig.getApiKey();

  if (!apiKey) {
    logger.error('[Discovery] API key not configured. Run `promptfoo auth login` first.');
    return { success: false, error: 'API key not configured' };
  }

  // When showing progress and NOT in verbose mode, use a spinner for connection
  // When verbose (debug logging enabled), skip spinner so logs are visible
  const useSpinner = showProgress && !isDebugEnabled();
  const connectSpinner = useSpinner ? ora({ text: 'Connecting...', color: 'cyan' }).start() : null;

  let socket: Socket | null = null;
  const abortController = new AbortController();
  let probeCount = 0;
  let currentSessionId: string | null = null;

  // Register cleanup on signals
  const signalHandler = () => {
    if (showProgress) {
      logger.info(chalk.yellow('\n\nCancelling discovery...'));
    }
    abortController.abort();
    if (socket && socket.connected) {
      // Emit cancel event to server with sessionId for direct lookup
      socket.emit('suggest:cancel', { source: 'cli', sessionId: currentSessionId });
      // Give the event time to be sent before disconnecting
      setTimeout(() => {
        socket?.disconnect();
        process.exit(0);
      }, 300);
    } else {
      process.exit(0);
    }
  };

  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);

  try {
    // Connect to socket
    socket = await createDiscoverySocket(apiHost, apiKey);

    // Emit discovery:connect to associate with a session
    socket.emit('discovery:connect', { targetId });

    // Wait for session association or error
    const sessionResult = await new Promise<DiscoverySessionJoinedPayload | DiscoveryErrorPayload>(
      (resolve) => {
        socket!.once('discovery:session_joined', (payload: DiscoverySessionJoinedPayload) => {
          resolve(payload);
        });

        socket!.once('discovery:error', (payload: DiscoveryErrorPayload) => {
          resolve(payload);
        });

        // Timeout waiting for session
        setTimeout(() => {
          resolve({ error: 'Timeout waiting for session association. Please start discovery from the UI first.' });
        }, 10000);
      },
    );

    // Stop connection spinner before handling result
    if (connectSpinner) {
      connectSpinner.stop();
    }

    if ('error' in sessionResult) {
      if (showProgress) {
        logger.info(chalk.red(`✗ ${sessionResult.error}`));
      }
      return { success: false, error: sessionResult.error };
    }

    // Store sessionId for cancel handler to use
    currentSessionId = sessionResult.sessionId;

    if (showProgress) {
      logger.info(chalk.bold('Ready to start auto-discovery.'));
      logger.info('This will probe your target to suggest relevant security plugins and strategies.');
      logger.info('');
    }

    // Prompt user for confirmation using consistent @inquirer/confirm pattern
    const confirmed = await confirm({
      message: 'Start auto-discovery?',
      default: true,
    });
    if (!confirmed) {
      if (showProgress) {
        logger.info(chalk.yellow('Discovery cancelled.'));
      }
      socket.disconnect();
      return undefined;
    }

    // Start discovery
    socket.emit('discovery:start', { suggestionSessionId: sessionResult.sessionId });

    if (showProgress) {
      logger.info('');
      logger.info(chalk.green('✓ Discovery started'));
      logger.info(chalk.dim('  Follow detailed progress in the UI'));
      logger.info('');
    }

    // Create spinner for probing (similar to code scan command)
    // Skip spinner when verbose/debug logging is enabled so logs are visible
    const spinner = useSpinner ? ora({ text: 'Probing target...', color: 'green' }).start() : null;

    // Handle probe requests from server
    socket.on('discovery:probe', async (payload: DiscoveryProbePayload) => {
      const { requestId, prompt } = payload;
      probeCount++;

      logger.debug(
        `[Discovery] Received probe request from server (routing through CLI) requestId=${requestId} probeCount=${probeCount} promptLength=${prompt.length}`,
      );

      if (spinner) {
        spinner.text = 'Probing target...';
      }

      try {
        const response = await target.callApi(prompt, {
          prompt: { raw: prompt, label: 'Discovery Probe' },
          vars: {},
        });

        const output = response.output || '';
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

        const tokenUsage = response.tokenUsage
          ? {
              input: response.tokenUsage.prompt || 0,
              output: response.tokenUsage.completion || 0,
              total: response.tokenUsage.total || 0,
            }
          : undefined;

        logger.debug(
          `[Discovery] Sending probe result back to server requestId=${requestId} outputLength=${outputStr.length} hasTokenUsage=${!!tokenUsage}`,
        );

        socket!.emit('discovery:probe_result', {
          requestId,
          output: outputStr,
          tokenUsage,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.debug(`[Discovery] Probe error requestId=${requestId} error=${errorMessage}`);

        socket!.emit('discovery:probe_result', {
          requestId,
          error: errorMessage,
        });
      }
    });

    // Wait for completion, cancellation, or error
    const result = await new Promise<
      DiscoveryCompletedPayload | DiscoveryErrorPayload | { cancelled: true; source?: 'ui' | 'cli' }
    >((resolve) => {
      socket!.on('suggest:complete', (payload: { output?: DiscoveryCompletedPayload['output'] }) => {
        resolve({ output: payload.output });
      });

      socket!.on('suggest:cancelled', (payload: DiscoveryCancelledPayload) => {
        resolve({ cancelled: true, source: payload.source });
      });

      socket!.on('suggest:error', (payload: DiscoveryErrorPayload) => {
        resolve(payload);
      });

      socket!.on('discovery:error', (payload: DiscoveryErrorPayload) => {
        resolve(payload);
      });

      socket!.on('disconnect', (reason) => {
        if (!abortController.signal.aborted) {
          resolve({ error: `Disconnected: ${reason}` });
        }
      });

      // Listen for abort signal (local Ctrl+C)
      abortController.signal.addEventListener('abort', () => {
        resolve({ cancelled: true, source: 'cli' });
      });
    });

    // Stop spinner
    if (spinner) {
      spinner.stop();
    }

    socket.disconnect();

    if ('cancelled' in result) {
      if (showProgress) {
        if (result.source === 'ui') {
          logger.info(chalk.yellow('Auto-discovery was cancelled from the UI.'));
        } else {
          logger.info(chalk.yellow('Discovery cancelled.'));
        }
      }
      return undefined;
    }

    if ('error' in result) {
      if (showProgress) {
        logger.info('');
        logger.info(chalk.red(`✗ Discovery failed: ${result.error}`));
      }
      return { success: false, error: result.error };
    }

    if (showProgress) {
      logger.info('');
      logger.info(chalk.green('✓ Discovery complete'));
      if (result.output) {
        logger.info(chalk.dim(`  Found ${result.output.plugins?.length || 0} plugins, ${result.output.strategies?.length || 0} strategies`));
      }
      logger.info('');
      logger.info(chalk.bold('Return to the UI to see detailed results.'));
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[Discovery] Error: ${errorMessage}`);

    if (socket) {
      socket.disconnect();
    }

    return { success: false, error: errorMessage };
  } finally {
    process.removeListener('SIGINT', signalHandler);
    process.removeListener('SIGTERM', signalHandler);
  }
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
      telemetry.record('redteam discover', {});

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
      // If the target flag is provided, load it from Cloud and use socket-based discovery:
      else if (args.target) {
        // Let the internal error handling bubble up:
        const providerOptions = await getProviderFromCloud(args.target);
        target = await loadApiProvider(providerOptions.id, { options: providerOptions });

        // Use socket-based discovery for cloud targets
        // This allows the server to orchestrate the discovery while CLI handles local probes
        try {
          const result = await doSocketBasedDiscovery(target, args.target);

          if (result === undefined) {
            // User cancelled
            process.exit(0);
          }

          if (!result.success) {
            logger.error(`Discovery failed: ${result.error}`);
            process.exit(1);
          }

          // Socket-based discovery completed successfully
          // Results are shown in the UI
          process.exit(0);
        } catch (error) {
          logger.error(
            `An unexpected error occurred during discovery: ${error instanceof Error ? error.message : String(error)}`,
          );
          process.exit(1);
        }
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
