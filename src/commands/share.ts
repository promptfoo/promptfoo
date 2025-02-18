import chalk from 'chalk';
import type { Command } from 'commander';
import { randomUUID } from 'crypto';
import dedent from 'dedent';
import opener from 'opener';
import readline from 'readline';
import { EventSource } from 'undici';
import { URL } from 'url';
import { getEnvString } from '../envars';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import Eval from '../models/eval';
import { createShareableUrl } from '../share';
import telemetry from '../telemetry';
import { setupEnv } from '../util';
import invariant from '../util/invariant';

export { determineShareDomain } from '../share';

export async function createPublicUrl(evalRecord: Eval, showAuth: boolean) {
  const url = await createShareableUrl(evalRecord, showAuth);

  logger.info(`View results: ${chalk.greenBright.bold(url)}`);
  return url;
}

async function handleBrowserAuth(apiHost: string): Promise<string> {
  const stateToken = randomUUID();
  // Ensure we're using the API URL for auth endpoints
  const apiUrl = apiHost.endsWith('/api') ? apiHost : `${apiHost}/api`;
  const loginUrl = `${apiUrl}/auth/cli?state=${stateToken}`;

  return new Promise((resolve, reject) => {
    let eventSource: EventSource | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    let connectionEstablished = false;

    const cleanup = () => {
      logger.debug('Cleaning up EventSource connection');
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const connect = () => {
      // Clean up existing connection if any
      cleanup();

      // Create new connection
      const eventSourceUrl = `${apiUrl}/auth/cli/events?state=${stateToken}`;
      logger.debug(`Creating new SSE connection to ${eventSourceUrl}`);
      eventSource = new EventSource(eventSourceUrl);

      // Listen for the authentication event
      eventSource.addEventListener('authenticated', (event: any) => {
        logger.debug(`Received authenticated event: ${event.data}`);
        try {
          const data = JSON.parse(event.data);
          if (data.token) {
            logger.debug('Successfully parsed token from authenticated event');
            cleanup();
            resolve(data.token);
          } else {
            logger.error('Authenticated event received but no token in payload');
          }
        } catch (err) {
          logger.error(`Failed to parse authentication data: ${err}`);
          cleanup();
          reject(new Error('Authentication failed. Invalid response format.'));
        }
      });

      // Handle connection state changes
      eventSource.onopen = () => {
        logger.debug('SSE connection opened successfully');
        // Reset reconnect attempts on successful connection
        reconnectAttempts = 0;
      };

      // Wait for server to acknowledge connection
      eventSource.addEventListener('connected', (event: any) => {
        logger.debug(`Received connected event: ${event.data}`);
        if (!connectionEstablished) {
          connectionEstablished = true;
          // Small delay to ensure server has fully set up the connection
          setTimeout(() => {
            logger.info(chalk.green('Opening browser for authentication...'));
            opener(loginUrl);
            logger.info(chalk.yellow('Waiting for authentication to complete in browser...'));
          }, 500);
        }
      });

      // Handle connection errors
      eventSource.onerror = (err: any) => {
        logger.debug(`SSE connection error: ${err}`);
        // Check readyState to understand connection status
        // 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
        logger.debug(`SSE readyState: ${eventSource?.readyState}`);

        if (eventSource?.readyState === 2) {
          // CLOSED
          logger.debug('SSE connection closed');
          // Close current connection
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }

          // Attempt to reconnect with backoff
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            logger.debug(
              `Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`,
            );
            setTimeout(connect, delay);
            reconnectAttempts++;
          } else {
            logger.error('Max reconnection attempts reached');
            cleanup();
            reject(new Error('Failed to maintain connection to authentication server'));
          }
        }
      };

      // Listen for all messages for debugging
      eventSource.onmessage = (event: any) => {
        logger.debug(`Received SSE message: ${event.data}`);
      };

      // Set up a timeout for the entire auth process
      timeoutId = setTimeout(
        () => {
          logger.error('Authentication timed out after 5 minutes');
          cleanup();
          reject(new Error('Authentication timed out'));
        },
        5 * 60 * 1000,
      );
    };

    // Start initial connection
    connect();
  });
}

export function shareCommand(program: Command) {
  program
    .command('share [evalId]')
    .description('Create a shareable URL of an eval (defaults to most recent)' + '\n\n')
    .option('-y, --yes', 'Skip confirmation')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option(
      '--show-auth',
      'Show username/password authentication information in the URL if exists',
      false,
    )
    .action(
      async (
        evalId: string | undefined,
        cmdObj: { yes: boolean; envPath?: string; showAuth: boolean } & Command,
      ) => {
        setupEnv(cmdObj.envPath);
        telemetry.record('command_used', {
          name: 'share',
        });
        await telemetry.send();

        let eval_: Eval | undefined | null = null;
        if (evalId) {
          eval_ = await Eval.findById(evalId);
        } else {
          eval_ = await Eval.latest();

          if (!eval_) {
            logger.error('Could not load results. Do you need to run `promptfoo eval` first?');
            process.exit(1);
          }
        }
        invariant(eval_, 'No eval found');
        if (eval_.prompts.length === 0) {
          logger.error(
            dedent`
              Eval ${chalk.bold(eval_.id)} cannot be shared.
              This may be because the eval is still running or because it did not complete successfully.
              If your eval is still running, wait for it to complete and try again.
            `,
          );
          process.exit(1);
        }

        // Check if user is logged in
        if (!cloudConfig.isEnabled()) {
          try {
            // Default to localhost API server in development
            const apiHost =
              getEnvString('PROMPTFOO_SHARING_APP_BASE_URL') || 'http://localhost:3201';
            const token = await handleBrowserAuth(apiHost);
            cloudConfig.setApiKey(token);
          } catch (error) {
            logger.error(`Authentication failed: ${error}`);
            process.exit(1);
          }
        }

        if (cmdObj.yes || getEnvString('PROMPTFOO_DISABLE_SHARE_WARNING')) {
          await createPublicUrl(eval_, cmdObj.showAuth);
          return;
        }
        const reader = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        if (cloudConfig.isEnabled()) {
          logger.info(`Sharing eval to ${cloudConfig.getAppUrl()}`);
          await createPublicUrl(eval_, cmdObj.showAuth);
          process.exit(0);
        }
        const baseUrl = getEnvString('PROMPTFOO_SHARING_APP_BASE_URL');
        const hostname = baseUrl ? new URL(baseUrl).hostname : 'app.promptfoo.dev';
        reader.question(
          `Create a private shareable URL of your eval on ${hostname}?\n\nTo proceed, please confirm [Y/n] `,
          async function (answer: string) {
            if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y' && answer !== '') {
              reader.close();
              process.exit(1);
            }
            reader.close();

            await createPublicUrl(eval_, cmdObj.showAuth);
          },
        );
      },
    );
}
