import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import readline from 'readline';
import { fetchWithProxy } from '../fetch';
import { getUserEmail, setUserEmail } from '../globalConfig/accounts';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import telemetry from '../telemetry';

async function promptForInput(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  } finally {
    rl.close();
  }
}

async function promptForToken(): Promise<string> {
  return promptForInput('Please enter your API token: ');
}

async function promptForEmail(): Promise<string> {
  return promptForInput('Please enter your email: ');
}

export function authCommand(program: Command) {
  const authCommand = program.command('auth').description('Manage authentication');

  authCommand
    .command('login')
    .description('Login')
    .option('-o, --org <orgId>', 'The organization id to login to.')
    .option(
      '-h,--host <host>',
      'The host of the promptfoo instance. This needs to be the url of the API if different from the app url.',
    )
    .option('-k, --api-key <apiKey>', 'Login using an API key.')
    .action(async (cmdObj: { orgId: string; host: string; apiKey: string }) => {
      let token: string | undefined;
      const apiHost = cmdObj.host || cloudConfig.getApiHost();

      try {
        if (cmdObj.apiKey) {
          token = cmdObj.apiKey;
        } else {
          const email = await promptForEmail();

          // Send login request

          const loginResponse = await fetchWithProxy(`${apiHost}/users/login?fromCLI=true`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, organizationId: cmdObj.orgId }),
          });

          if (!loginResponse.ok) {
            throw new Error('Failed to send login request: ' + loginResponse.statusText);
          }

          logger.info(
            chalk.green(
              `A login link has been sent to ${email}. Click the link to login and then copy your authentication token.`,
            ),
          );

          logger.info(
            chalk.yellow(
              "If you did not get an email it's because the user does not exist or your not part of the the organization specified.",
            ),
          );

          // Prompt for token
          token = await promptForToken();
        }
        const { user } = await cloudConfig.validateAndSetApiToken(token, apiHost);

        // Store token in global config
        setUserEmail(user.email);

        telemetry.record('command_used', {
          name: 'auth login',
        });
        await telemetry.send();
        process.exit(0);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Authentication failed: ${errorMessage}`);
        process.exit(1);
      }
    });

  authCommand
    .command('logout')
    .description('Logout')
    .action(async () => {
      await cloudConfig.delete();
      logger.info(chalk.green('Successfully logged out'));
      process.exit(0);
    });

  authCommand
    .command('whoami')
    .description('Show current user information')
    .action(async () => {
      try {
        const email = getUserEmail();
        const apiKey = cloudConfig.getApiKey();

        if (!email || !apiKey) {
          logger.info(`Not logged in. Run ${chalk.bold('promptfoo auth login')} to login.`);
          return;
        }

        const apiHost = cloudConfig.getApiHost();
        const response = await fetchWithProxy(`${apiHost}/users/me`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user info: ' + response.statusText);
        }

        const { user, organization } = await response.json();

        logger.info(dedent`
            Currently logged in as:
             User: ${user.email}
             Organization: ${organization.name}
             App URL: ${cloudConfig.getAppUrl()}`);

        telemetry.record('command_used', {
          name: 'auth whoami',
        });
        await telemetry.send();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to get user info: ${errorMessage}`);
        process.exitCode = 1;
      }
    });
}
