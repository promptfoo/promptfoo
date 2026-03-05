/**
 * `promptfoo redteam discover` command.
 *
 * Connects a CLI to an existing target setup session in Promptfoo Cloud,
 * providing local target probing and filesystem access for the setup agent.
 *
 * Usage:
 *   promptfoo redteam discover --session-id <id>
 */

import * as path from 'node:path';

import chalk from 'chalk';
import ora from 'ora';
import logger, { isDebugEnabled } from '../../logger';
import { loadApiProviders } from '../../providers/index';
import telemetry from '../../telemetry';
import { createAgentClient } from '../../util/agent/agentClient';
import { attachTargetLink } from '../../util/agent/targetLink';
import { attachTargetLinkFs } from '../../util/agent/targetLinkFs';
import { setupEnv } from '../../util/index';
import type { Command } from 'commander';

import type { ApiProvider } from '../../types/index';

export function discoverCommand(program: Command) {
  program
    .command('discover')
    .description(
      'Connect to a target setup session in Promptfoo Cloud, providing local target probing and filesystem access.',
    )
    .requiredOption('--session-id <id>', 'Session ID from the target setup wizard')
    .option('--host <url>', 'API host URL override')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(
      async (cmdObj: { sessionId: string; host?: string; envPath?: string; envFile?: string }) => {
        setupEnv(cmdObj.envPath || cmdObj.envFile);
        telemetry.record('redteam discover', {});

        const rootDir = process.cwd();

        // Skip spinners when verbose/debug logging is enabled so logs are visible
        const useSpinner = !isDebugEnabled();
        const connectSpinner = useSpinner
          ? ora({ text: 'Connecting...', color: 'cyan' }).start()
          : null;

        try {
          const client = await createAgentClient({
            agent: 'targetSetup',
            sessionId: cmdObj.sessionId,
            ...(cmdObj.host && { host: cmdObj.host }),
          });

          if (connectSpinner) {
            connectSpinner.stop();
          }

          logger.info('');
          logger.info(chalk.green('✓ Discovery started'));
          logger.info(chalk.dim('  Follow detailed progress in the UI'));
          logger.info('');

          // Track provider files written by the setup agent's compile_pipeline tool
          const writtenProviderFiles: string[] = [];

          // Wire filesystem handlers with write tracking
          attachTargetLinkFs(client, rootDir, {
            onFileWritten: (absolutePath) => {
              writtenProviderFiles.push(absolutePath);
              logger.debug(
                `[TargetLink] Provider file written: ${path.relative(rootDir, absolutePath)}`,
              );
            },
          });

          // Lazy provider that loads the compiled JS file on first PROBE
          let cachedProvider: ApiProvider | null = null;
          const lazyProvider: ApiProvider = {
            id: () => 'discover-session',
            callApi: async (prompt, context, options) => {
              if (!cachedProvider) {
                const providerFile = writtenProviderFiles[writtenProviderFiles.length - 1];
                if (!providerFile) {
                  return {
                    error:
                      'No provider file available. The setup agent must compile a pipeline first.',
                  };
                }
                logger.debug(
                  `[TargetLink] Loading provider from ${path.relative(rootDir, providerFile)}`,
                );
                const providers = await loadApiProviders([`file://${providerFile}`], {
                  basePath: rootDir,
                });
                if (!providers.length) {
                  return { error: `Failed to load provider from ${providerFile}` };
                }
                cachedProvider = providers[0];
              }
              return cachedProvider.callApi(prompt, context, options);
            },
          };

          // Wire probe handlers (PROBE + PROBE_HTTP) and signal ready
          attachTargetLink(client, lazyProvider, {
            clientName: 'discover',
            capabilities: ['probe', 'fs'],
          });

          const spinner = useSpinner
            ? ora({ text: 'Probing target...', color: 'green' }).start()
            : null;

          // Register cleanup on signals
          const signalHandler = () => {
            if (spinner) {
              spinner.stop();
            }
            logger.info(chalk.yellow('\n\nCancelling discovery...'));
            client.disconnect();
          };

          process.on('SIGINT', signalHandler);
          process.on('SIGTERM', signalHandler);

          // Wait for session end or disconnect
          await new Promise<void>((resolve) => {
            client.onComplete(() => {
              if (spinner) {
                spinner.stop();
              }
              logger.info('');
              logger.info(chalk.green('✓ Discovery complete'));
              logger.info('');
              logger.info(chalk.bold('Return to the UI to see detailed results.'));
              resolve();
            });

            client.onError((error) => {
              if (spinner) {
                spinner.stop();
              }
              logger.info('');
              logger.info(chalk.red(`✗ Discovery failed: ${error.message}`));
              resolve();
            });

            client.onCancelled(() => {
              if (spinner) {
                spinner.stop();
              }
              logger.info('');
              logger.info(chalk.yellow('Auto-discovery was cancelled from the UI.'));
              resolve();
            });

            client.socket.on('disconnect', () => {
              if (spinner) {
                spinner.stop();
              }
              logger.info('');
              logger.info(chalk.dim('Disconnected from server.'));
              resolve();
            });

            process.on('SIGINT', () => {
              resolve();
            });
          });

          process.removeListener('SIGINT', signalHandler);
          process.removeListener('SIGTERM', signalHandler);
          client.disconnect();
        } catch (error) {
          if (connectSpinner) {
            connectSpinner.stop();
          }
          logger.info(
            chalk.red(
              `✗ Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
          process.exitCode = 1;
        }
      },
    );
}
