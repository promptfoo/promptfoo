/**
 * `promptfoo redteam recon` command.
 *
 * Connects a CLI to an existing target setup session and provides
 * filesystem access so the agent can scan the user's codebase.
 *
 * Usage:
 *   promptfoo redteam recon --session-id <id>
 */

import chalk from 'chalk';
import type { Command } from 'commander';

import logger from '../../logger';
import telemetry from '../../telemetry';
import { TargetLinkEvents } from '../../types/targetLink';
import { createAgentClient } from '../../util/agent/agentClient';
import { attachTargetLinkFs } from '../../util/agent/targetLinkFs';
import { setupEnv } from '../../util/index';

import type { ReadyPayload } from '../../types/targetLink';

export function reconCommand(program: Command) {
  program
    .command('recon')
    .description(
      'Connect to a target setup session and provide filesystem access for codebase reconnaissance.',
    )
    .requiredOption('--session-id <id>', 'Session ID from the target setup wizard')
    .option('--host <url>', 'API host URL override')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(
      async (cmdObj: {
        sessionId: string;
        host?: string;
        envPath?: string;
      }) => {
        setupEnv(cmdObj.envPath);
        telemetry.record('redteam recon', {});

        const rootDir = process.cwd();

        logger.info(
          chalk.blue('Connecting to target setup session...'),
        );
        logger.info(
          chalk.dim(`  Session: ${cmdObj.sessionId}`),
        );
        logger.info(
          chalk.dim(`  Root dir: ${rootDir}`),
        );

        try {
          const client = await createAgentClient({
            agent: 'targetSetup',
            sessionId: cmdObj.sessionId,
            ...(cmdObj.host && { host: cmdObj.host }),
          });

          // Wire filesystem handlers
          attachTargetLinkFs(client, rootDir);

          // Signal ready with recon capabilities
          const readyPayload: ReadyPayload = {
            clientName: 'recon',
            capabilities: ['fs'],
          };
          client.emit(TargetLinkEvents.READY, readyPayload);

          logger.info(
            chalk.green('Connected! Providing filesystem access to the agent.'),
          );
          logger.info(
            chalk.dim('Press Ctrl+C to disconnect.'),
          );

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

            // Handle Ctrl+C
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
