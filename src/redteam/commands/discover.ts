/**
 * `promptfoo redteam discover` command.
 *
 * Connects a CLI to an existing target setup session in Promptfoo Cloud,
 * providing local target probing and filesystem access for the setup agent.
 *
 * Usage:
 *   promptfoo redteam discover --session-id <id>
 */

import chalk from 'chalk';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { TargetLinkEvents } from '../../types/targetLink';
import { createAgentClient } from '../../util/agent/agentClient';
import { attachTargetLinkFs } from '../../util/agent/targetLinkFs';
import { setupEnv } from '../../util/index';
import type { Command } from 'commander';

import type { ReadyPayload } from '../../types/targetLink';

// ========================================================
// Re-exports for backward compatibility
// ========================================================
// These are used by the OSS server routes and UI components.

export {
  doTargetPurposeDiscovery,
  normalizeTargetPurposeDiscoveryResult,
  TargetPurposeDiscoveryRequestSchema,
  type TargetPurposeDiscoveryResult,
  TargetPurposeDiscoveryTaskResponseSchema,
} from './targetPurposeDiscovery';

// ========================================================
// Command
// ========================================================

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

          // Wire filesystem handlers for codebase recon
          attachTargetLinkFs(client, rootDir);

          // Signal ready with probe + fs capabilities
          const readyPayload: ReadyPayload = {
            clientName: 'discover',
            capabilities: ['probe', 'fs'],
          };
          client.emit(TargetLinkEvents.READY, readyPayload);

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
