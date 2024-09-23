import chalk from 'chalk';
import type { Command } from 'commander';
import readline from 'readline';
import { fetchWithProxy } from '../fetch';
import { setUserEmail } from '../globalConfig/accounts';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import telemetry from '../telemetry';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function promptForToken(): Promise<string> {
  return new Promise((resolve) => {
    rl.question('Please enter your API token: ', (token) => {
      resolve(token.trim());
    });
  });
}

async function promptForEmail(): Promise<string> {
  return new Promise((resolve) => {
    rl.question('Please enter your email: ', (entry) => {
      resolve(entry.trim());
    });
  });
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
    .action(async (cmdObj: { orgId: string; host: string }) => {
      try {
        const email = await promptForEmail();

        // Send login request
        const apiHost = cmdObj.host || cloudConfig.getApiHost();

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
        const token = await promptForToken();
        await cloudConfig.validateAndSetApiToken(token, apiHost);

        // Store token in global config
        setUserEmail(email);

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
}
