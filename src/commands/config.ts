import chalk from 'chalk';
import type { Command } from 'commander';
import readline from 'readline';
import invariant from 'tiny-invariant';
import { fetchWithProxy } from '../fetch';
import { getUserEmail, setUserEmail } from '../globalConfig/accounts';
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

export function configCommand(program: Command) {
  const configCommand = program.command('config').description('Edit configuration settings');
  const getCommand = configCommand.command('get').description('Get configuration settings.');
  const setCommand = configCommand.command('set').description('Set configuration settings.');

  getCommand
    .command('email')
    .description('Get user email')
    .action(async () => {
      const email = getUserEmail();
      if (email) {
        logger.info(email);
      } else {
        logger.info('No email set.');
      }
      telemetry.record('command_used', {
        name: 'config get',
        configKey: 'email',
      });
      await telemetry.send();
    });

  setCommand
    .command('email <email>')
    .description('Set user email')
    .action(async (email: string) => {
      setUserEmail(email);
      if (email) {
        logger.info(`Email set to ${email}`);
      } else {
        logger.info('Email unset.');
      }
      telemetry.record('command_used', {
        name: 'config set',
        configKey: 'email',
      });
      await telemetry.send();
    });

  const cloudCommand = configCommand.command('cloud').description('Manage cloud settings');
  const getCloudCommand = cloudCommand.command('get').description('Get cloud settings.');
  const setCloudCommand = cloudCommand.command('set').description('Set cloud settings.');

  getCloudCommand
    .command('host')
    .description('Get the cloud API host')
    .action(async () => {
      logger.info(cloudConfig.getApiHost());
      process.exit(0);
    });

  setCloudCommand
    .command('host <apiHost>')
    .description('Set the cloud API host')
    .action(async (apiHost: string) => {
      cloudConfig.setApiHost(apiHost);
      logger.info(`Cloud API host set to ${cloudConfig.getApiHost()}`);
      telemetry.record('command_used', {
        name: 'config set cloud_host',
      });
      await telemetry.send();
      process.exit(0);
    });

  setCloudCommand
    .command('api-token <apiToken>')
    .description('Set the cloud API token')
    .action(async (apiToken: string) => {
      cloudConfig.setApiKey(apiToken);
      logger.info('Cloud API token set.');
      telemetry.record('command_used', {
        name: 'config set cloud_api_token',
      });
      await telemetry.send();
      process.exit(0);
    });

  cloudCommand
    .command('login')
    .description('Login to the cloud')
    .action(async (email: string, cmdObj: { orgId: string }) => {
      try {
        if (!email || typeof email !== 'string') {
          email = await promptForEmail();
        }
        // Send login request
        const apiHost = cloudConfig.getApiHost();
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
            `A login link has been sent to ${email}. Click the link to login and then click "Copy API Token" from your profile drop down.`,
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
}
