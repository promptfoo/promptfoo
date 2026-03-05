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
import logger from '../../logger';
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

        logger.info(chalk.blue('Connecting to target setup session...'));
        logger.info(chalk.dim(`  Session: ${cmdObj.sessionId}`));
        logger.info(chalk.dim(`  Root dir: ${rootDir}`));

        try {
          const client = await createAgentClient({
            agent: 'targetSetup',
            sessionId: cmdObj.sessionId,
            ...(cmdObj.host && { host: cmdObj.host }),
          });

          // Track provider files written by the setup agent's compile_pipeline tool
          const writtenProviderFiles: string[] = [];

          // Wire filesystem handlers with write tracking
          attachTargetLinkFs(client, rootDir, {
            onFileWritten: (absolutePath) => {
              writtenProviderFiles.push(absolutePath);
              logger.info(
                chalk.dim(`  Provider file written: ${path.relative(rootDir, absolutePath)}`),
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
                logger.info(
                  chalk.dim(`  Loading provider from ${path.relative(rootDir, providerFile)}...`),
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

          logger.info(chalk.green('Connected! Providing local access to the setup agent.'));
          logger.info(chalk.dim('Press Ctrl+C to disconnect.'));

          // Wait for session end or disconnect
          await new Promise<void>((resolve) => {
            client.onComplete(() => {
              logger.info(chalk.green('Session completed.'));
              resolve();
            });

            client.onError((error) => {
              logger.error(`Session error: ${error.message}`);
              resolve();
            });

            client.onCancelled(() => {
              logger.info('Session cancelled.');
              resolve();
            });

            client.socket.on('disconnect', () => {
              logger.info('Disconnected from server.');
              resolve();
            });

            process.on('SIGINT', () => {
              logger.info('\nDisconnecting...');
              client.disconnect();
              resolve();
            });
          });

          client.disconnect();
        } catch (error) {
          logger.error(
            `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
          );
          process.exitCode = 1;
        }
      },
    );
}
