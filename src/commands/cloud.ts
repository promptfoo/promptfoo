import type { GlobalConfig } from '@promptfoo/configTypes';
import chalk from 'chalk';
import { Command } from 'commander';
import * as readline from 'readline';
import { fetchWithProxy } from '../fetch';
import { readGlobalConfig, writeGlobalConfigPartial } from '../globalConfig';
import logger from '../logger';
import telemetry from '../telemetry';

const API_HOST = process.env.API_HOST || 'https://api.promptfoo.app';

const DEFAULT_CLOUD_CONFIG: GlobalConfig['cloud'] = {
  apiHost: 'https://api.promptfoo.app',
  appUrl: 'https://www.promptfoo.app',
};

function updateCloudConfig(partialConfig: Partial<GlobalConfig['cloud']>) {
  const cloudConfig = readGlobalConfig().cloud;
  writeGlobalConfigPartial({ cloud: { ...cloudConfig, ...partialConfig } });
}

export function getCloudConfig(): GlobalConfig['cloud'] {
  return readGlobalConfig().cloud || DEFAULT_CLOUD_CONFIG;
}

export function isCloudEnabled(): boolean {
  return !!getCloudConfig()?.apiKey;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function promptForToken(): Promise<string> {
  return new Promise((resolve) => {
    rl.question('Please enter your API token: ', (token) => {
      resolve(token.trim());
      rl.close();
    });
  });
}

async function validateApiToken(token: string, apiHost: string): Promise<void> {
  const response = await fetchWithProxy(`${apiHost}/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to validate API token: ' + response.statusText);
  }

  logger.info('You are logged in successfully.');
  const { user, organization, app } = await response.json();
  await updateCloudConfig({ apiKey: token, appUrl: app.url });

  logger.info(`User: ${user.email}`);
  logger.info(`Organization: ${organization.name}`);
  logger.info(`Login at ${app.url}`);
}

export function cloudCommand(program: Command) {
  const cloudCommand = program.command('cloud').description('Cloud commands');

  cloudCommand
    .command('login')
    .argument('<email>', 'Email address for authentication')
    .option('-o, --orgId <orgId>', 'Organization ID for authentication')
    .action(async (email: string, cmdObj: { orgId: string }) => {
      try {
        // Send login request
        const apiHost = readGlobalConfig().cloud?.apiHost || API_HOST;
        const loginResponse = await fetchWithProxy(`${apiHost}/users/login`, {
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
        await validateApiToken(token, apiHost);

        // Store token in global config
        writeGlobalConfigPartial({ account: { email } });

        telemetry.record('command_used', {
          name: 'auth login',
        });
        await telemetry.send();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Authentication failed: ${errorMessage}`);
        process.exit(1);
      }
    });

  // Set API Token
  cloudCommand
    .command('api-token')
    .argument('<apiToken>', 'API token')
    .description('Set the API token')
    .action(async (apiToken: string) => {
      try {
        const cloudConfig = readGlobalConfig().cloud;
        const apiHost = cloudConfig?.apiHost || API_HOST;
        await validateApiToken(apiToken, apiHost);
        logger.info('API token validated and set successfully');
        process.exit(0);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to set API token: ${errorMessage}`);
        process.exit(1);
      }
    });

  cloudCommand
    .command('api-host')
    .description('Manage the API host')
    .addCommand(
      new Command('set')
        .argument('<apiHost>', 'New API host URL')
        .description('Set the API host')
        .action(async (apiHost: string) => {
          updateCloudConfig({ apiHost });
          logger.info(`API host set to ${apiHost}`);
          process.exit(0);
        }),
    )
    .addCommand(
      new Command('show').description('Display the current API host').action(async () => {
        const cloudConfig = readGlobalConfig().cloud;
        logger.info(`API host: ${cloudConfig?.apiHost || API_HOST}`);
        process.exit(0);
      }),
    );
}
