import chalk from 'chalk';
import dedent from 'dedent';
import { fetchWithProxy } from '../../fetch';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import telemetry from '../../telemetry';

export async function loginAction(cmdObj: {
  orgId?: string;
  host?: string;
  apiKey?: string;
}): Promise<void> {
  let token: string | undefined;
  const apiHost = cmdObj.host || cloudConfig.getApiHost();
  telemetry.record('command_used', {
    name: 'auth login',
  });

  try {
    if (cmdObj.apiKey) {
      token = cmdObj.apiKey;
      const { user } = await cloudConfig.validateAndSetApiToken(token, apiHost);
      // Store token in global config and handle email sync
      const existingEmail = getUserEmail();
      if (existingEmail && existingEmail !== user.email) {
        logger.info(
          chalk.yellow(`Updating local email configuration from ${existingEmail} to ${user.email}`),
        );
      }
      setUserEmail(user.email);
      logger.info(chalk.green('Successfully logged in'));
      return;
    } else {
      logger.info(
        `Please login or sign up at ${chalk.green('https://promptfoo.app')} to get an API key.`,
      );

      logger.info(
        `After logging in, you can get your api token at ${chalk.green('https://promptfoo.app/welcome')}`,
      );
    }

    return;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Authentication failed: ${errorMessage}`);
    process.exitCode = 1;
    return;
  }
}

export async function logoutAction(): Promise<void> {
  const email = getUserEmail();
  const apiKey = cloudConfig.getApiKey();

  if (!email && !apiKey) {
    logger.info(chalk.yellow("You're already logged out - no active session to terminate"));
    return;
  }

  await cloudConfig.delete();
  // Always unset email on logout
  setUserEmail('');
  logger.info(chalk.green('Successfully logged out'));
  return;
}

export async function whoamiAction(): Promise<void> {
  try {
    const email = getUserEmail();
    const apiKey = cloudConfig.getApiKey();

    if (!email || !apiKey) {
      logger.info(`Not logged in. Run ${chalk.bold('promptfoo auth login')} to login.`);
      return;
    }

    const apiHost = cloudConfig.getApiHost();
    const response = await fetchWithProxy(`${apiHost}/api/v1/users/me`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info: ' + response.statusText);
    }

    const { user, organization } = await response.json();

    logger.info(dedent`
        ${chalk.green.bold('Currently logged in as:')}
        User: ${chalk.cyan(user.email)}
        Organization: ${chalk.cyan(organization.name)}
        App URL: ${chalk.cyan(cloudConfig.getAppUrl())}`);

    telemetry.record('command_used', {
      name: 'auth whoami',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to get user info: ${errorMessage}`);
    process.exitCode = 1;
  }
}
