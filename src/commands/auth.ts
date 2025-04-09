import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import opener from 'opener';
import { fetchWithProxy } from '../fetch';
import { getUserEmail, setUserEmail } from '../globalConfig/accounts';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import telemetry from '../telemetry';
import { isInteractiveSession, promptYesNo, promptForInput } from '../util/cli';

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
    .option('-b, --browser', 'Open browser for authentication.')
    .option('-n, --no-browser', 'Do not open browser for authentication.')
    .action(async (cmdObj: { orgId: string; host: string; apiKey: string; browser?: boolean }) => {
      let token: string | undefined;
      const apiHost = cmdObj.host || cloudConfig.getApiHost();
      const appUrl = cloudConfig.getAppUrl();

      try {
        if (cmdObj.apiKey) {
          token = cmdObj.apiKey;
        } else {
          // Check if browser-based auth should be offered
          const interactive = isInteractiveSession();
          const useBrowser =
            cmdObj.browser !== false && // Not explicitly disabled
            interactive && // In interactive session
            (cmdObj.browser === true || // Explicitly enabled or
              (await promptYesNo('Would you like to open a browser to authenticate?'))); // User confirms

          if (useBrowser) {
            // Open browser to auth page
            const welcomeUrl = `${appUrl}/welcome`;
            logger.info(chalk.green(`Opening browser to ${welcomeUrl} for authentication`));

            try {
              await opener(welcomeUrl);
              logger.info(chalk.yellow('After authenticating in the browser, copy your API token'));

              // Prompt for token after browser auth
              token = await promptForToken();
            } catch (error) {
              logger.error(`Failed to open browser: ${String(error)}`);
              // Fall back to email flow
              logger.info(chalk.yellow('Falling back to email authentication...'));
            }
          }

          // If browser auth wasn't selected or failed, use email flow
          if (!token) {
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
                "If you did not get an email it's because the user does not exist or you're not part of the organization specified.",
              ),
            );

            // Prompt for token
            token = await promptForToken();
          }
        }

        const { user } = await cloudConfig.validateAndSetApiToken(token, apiHost);

        // Store token in global config and handle email sync
        const existingEmail = getUserEmail();
        if (existingEmail && existingEmail !== user.email) {
          logger.info(
            chalk.yellow(
              `Updating local email configuration from ${existingEmail} to ${user.email}`,
            ),
          );
        }
        setUserEmail(user.email);

        logger.info(chalk.green('Successfully logged in!'));

        telemetry.record('command_used', {
          name: 'auth login',
        });
        await telemetry.send();
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Authentication failed: ${errorMessage}`);
        process.exitCode = 1;
        return;
      }
    });

  authCommand
    .command('logout')
    .description('Logout')
    .action(async () => {
      await cloudConfig.delete();
      // Always unset email on logout
      setUserEmail('');
      logger.info(chalk.green('Successfully logged out'));
      return;
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
            ${chalk.green.bold('Currently logged in as:')}
            User: ${chalk.cyan(user.email)}
            Organization: ${chalk.cyan(organization.name)}
            App URL: ${chalk.cyan(cloudConfig.getAppUrl())}`);

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
