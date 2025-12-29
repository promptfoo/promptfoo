import input from '@inquirer/input';
import select from '@inquirer/select';
import chalk from 'chalk';
import dedent from 'dedent';
import ora from 'ora';
import { isNonInteractive } from '../envars';
import { getUserEmail, setUserEmail } from '../globalConfig/accounts';
import { CLOUD_API_HOST, cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import {
  canCreateTargets,
  getDefaultTeam,
  getUserTeams,
  resolveTeamFromIdentifier,
  resolveTeamId,
} from '../util/cloud';
import { fetchWithProxy } from '../util/fetch/index';
import type { Command } from 'commander';

// Device code flow types
interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenSuccessResponse {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
  };
}

interface DeviceTokenErrorResponse {
  error: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied';
  error_description: string;
}

type DeviceTokenResponse = DeviceTokenSuccessResponse | DeviceTokenErrorResponse;

/**
 * Request a device code for CLI authentication
 */
async function requestDeviceCode(apiHost: string): Promise<DeviceCodeResponse> {
  const response = await fetchWithProxy(`${apiHost}/api/v1/auth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'promptfoo-cli' }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to request device code: ${error}`);
  }

  return response.json();
}

/**
 * Poll for device authorization
 */
async function pollForToken(
  apiHost: string,
  deviceCode: string,
  interval: number,
  expiresIn: number,
): Promise<DeviceTokenSuccessResponse> {
  const startTime = Date.now();
  const expiresAtMs = startTime + expiresIn * 1000;
  let pollInterval = interval * 1000;

  while (Date.now() < expiresAtMs) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const response = await fetchWithProxy(`${apiHost}/api/v1/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data: DeviceTokenResponse = await response.json();

    if ('access_token' in data) {
      return data;
    }

    if (data.error === 'slow_down') {
      // Increase interval by 5 seconds as per OAuth spec
      pollInterval += 5000;
      continue;
    }

    if (data.error === 'authorization_pending') {
      continue;
    }

    if (data.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.');
    }

    if (data.error === 'access_denied') {
      throw new Error('Authorization was denied.');
    }
  }

  throw new Error('Device code expired. Please try again.');
}

/**
 * Open browser to device verification URL
 */
async function openDeviceVerificationUrl(url: string): Promise<void> {
  try {
    const open = (await import('open')).default;
    await open(url);
  } catch {
    // If opening browser fails, user can manually navigate
  }
}

export function authCommand(program: Command) {
  const authCommand = program.command('auth').description('Manage authentication');

  authCommand
    .command('login')
    .description('Login to Promptfoo Cloud or Enterprise')
    .option('-o, --org <orgId>', 'The organization id to login to.')
    .option(
      '-h,--host <host>',
      'The host of the promptfoo instance. This needs to be the url of the API if different from the app url.',
    )
    .option('-k, --api-key <apiKey>', 'Login using an API key.')
    .option(
      '-t, --team <team>',
      'The team to use (name, slug, or ID). Required in CI when multiple teams exist.',
    )
    .action(async (cmdObj: { orgId: string; host: string; apiKey: string; team?: string }) => {
      try {
        // If API key is provided, use it directly (backwards compatible)
        if (cmdObj.apiKey) {
          const apiHost = cmdObj.host || cloudConfig.getApiHost();
          await loginWithApiKey(cmdObj.apiKey, apiHost, cmdObj.team);
          return;
        }

        // Non-interactive mode: require API key
        if (isNonInteractive()) {
          logger.error(
            'Authentication required. Please set PROMPTFOO_API_KEY environment variable or use --api-key flag.',
          );
          logger.info(chalk.dim('Example: promptfoo auth login --api-key <your-api-key>'));
          process.exitCode = 1;
          return;
        }

        // Interactive mode: Use device code flow
        let apiHost: string;

        // Determine if we're using cloud or enterprise
        if (cmdObj.host) {
          // Host explicitly provided via flag
          apiHost = cmdObj.host;
        } else {
          // Prompt user for cloud vs enterprise
          const instanceType = await select({
            message: 'Where would you like to log in?',
            choices: [
              {
                name: 'Promptfoo Cloud',
                value: 'cloud',
                description: 'promptfoo.app',
              },
              {
                name: 'Enterprise / Self-hosted',
                value: 'enterprise',
                description: "Your organization's Promptfoo instance",
              },
            ],
          });

          if (instanceType === 'cloud') {
            apiHost = CLOUD_API_HOST;
          } else {
            // Prompt for enterprise URL
            const enterpriseUrl = await input({
              message: 'Enter your Promptfoo instance URL:',
              validate: (value) => {
                try {
                  new URL(value);
                  return true;
                } catch {
                  return 'Please enter a valid URL (e.g., https://promptfoo.yourcompany.com)';
                }
              },
            });
            // Normalize URL - ensure we have the API host
            const url = new URL(enterpriseUrl);
            apiHost = url.origin;
          }
        }

        // Request device code
        logger.info('');
        const requestingSpinner = ora({
          text: 'Requesting device code...',
          spinner: 'dots',
        }).start();

        let deviceCode: DeviceCodeResponse;
        try {
          deviceCode = await requestDeviceCode(apiHost);
          requestingSpinner.succeed('Device code received');
        } catch (error) {
          requestingSpinner.fail('Failed to request device code');
          throw error;
        }

        // Display the code and verification URL
        logger.info('');
        logger.info(chalk.bold('To complete login, visit:'));
        logger.info(chalk.cyan.bold(`  ${deviceCode.verification_uri_complete}`));
        logger.info('');
        logger.info(`Or go to ${chalk.cyan(deviceCode.verification_uri)} and enter code:`);
        logger.info(chalk.yellow.bold(`  ${deviceCode.user_code}`));
        logger.info('');

        // Open browser automatically
        await openDeviceVerificationUrl(deviceCode.verification_uri_complete);

        // Poll for authorization
        const pollingSpinner = ora({
          text: 'Waiting for authorization...',
          spinner: 'dots',
        }).start();

        let tokenResponse: DeviceTokenSuccessResponse;
        try {
          tokenResponse = await pollForToken(
            apiHost,
            deviceCode.device_code,
            deviceCode.interval,
            deviceCode.expires_in,
          );
          pollingSpinner.succeed('Authorization complete');
        } catch (error) {
          pollingSpinner.fail('Authorization failed');
          throw error;
        }

        // Store the token
        cloudConfig.setApiKey(tokenResponse.access_token);
        cloudConfig.setApiHost(apiHost);

        // Derive app URL from API host (replace 'api.' with 'www.' if present)
        const appUrl = apiHost.replace('://api.', '://www.');
        cloudConfig.setAppUrl(appUrl);

        // Set user email
        const existingEmail = getUserEmail();
        if (existingEmail && existingEmail !== tokenResponse.user.email) {
          logger.info(
            chalk.yellow(
              `Updating local email configuration from ${existingEmail} to ${tokenResponse.user.email}`,
            ),
          );
        }
        setUserEmail(tokenResponse.user.email);

        // Set current organization context
        cloudConfig.setCurrentOrganization(tokenResponse.organization.id);

        // Display login success
        logger.info('');
        logger.info(chalk.green.bold('✓ Successfully logged in'));
        logger.info(`  User: ${chalk.cyan(tokenResponse.user.email)}`);
        logger.info(`  Organization: ${chalk.cyan(tokenResponse.organization.name)}`);
        logger.info(`  App: ${chalk.cyan(appUrl)}`);

        // Set up team
        await setupTeamAfterLogin(tokenResponse.organization.id, cmdObj.team);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Authentication failed: ${errorMessage}`);
        process.exitCode = 1;
      }
    });

  /**
   * Login using an API key directly
   */
  async function loginWithApiKey(
    apiKey: string,
    apiHost: string,
    teamIdentifier?: string,
  ): Promise<void> {
    const { user, organization } = await cloudConfig.validateAndSetApiToken(apiKey, apiHost);

    // Store token in global config and handle email sync
    const existingEmail = getUserEmail();
    if (existingEmail && existingEmail !== user.email) {
      logger.info(
        chalk.yellow(`Updating local email configuration from ${existingEmail} to ${user.email}`),
      );
    }
    setUserEmail(user.email);

    // Set current organization context
    cloudConfig.setCurrentOrganization(organization.id);

    // Display login success with user/org info
    logger.info(chalk.green.bold('Successfully logged in'));
    logger.info(`User: ${chalk.cyan(user.email)}`);
    logger.info(`Organization: ${chalk.cyan(organization.name)}`);
    logger.info(`App: ${chalk.cyan(cloudConfig.getAppUrl())}`);

    // Set up team
    await setupTeamAfterLogin(organization.id, teamIdentifier);
  }

  /**
   * Set up team context after successful login
   */
  async function setupTeamAfterLogin(
    organizationId: string,
    teamIdentifier?: string,
  ): Promise<void> {
    try {
      const allTeams = await getUserTeams();
      cloudConfig.cacheTeams(allTeams, organizationId);

      let selectedTeam;

      if (teamIdentifier) {
        // --team flag provided: use specified team
        selectedTeam = await resolveTeamFromIdentifier(teamIdentifier);
        cloudConfig.setCurrentTeamId(selectedTeam.id, organizationId);
        logger.info(`  Team: ${chalk.cyan(selectedTeam.name)}`);
      } else if (allTeams.length === 1) {
        // Single team: just use it
        selectedTeam = allTeams[0];
        cloudConfig.setCurrentTeamId(selectedTeam.id, organizationId);
        logger.info(`  Team: ${chalk.cyan(selectedTeam.name)}`);
      } else if (allTeams.length > 1) {
        // Multiple teams
        if (isNonInteractive()) {
          // Non-interactive (CI): use default team but warn
          const defaultTeam = await getDefaultTeam();
          cloudConfig.setCurrentTeamId(defaultTeam.id, organizationId);
          logger.info(`  Team: ${chalk.cyan(defaultTeam.name)}`);
          logger.warn(
            chalk.yellow(
              `\n⚠️  You have access to ${allTeams.length} teams. Using '${defaultTeam.name}'.`,
            ),
          );
          logger.info(
            chalk.dim(`   Use --team flag to specify: promptfoo auth login --team <name>`),
          );
        } else {
          // Interactive: prompt user to select
          logger.info('');
          try {
            const answer = await select({
              message: 'Select a team to use:',
              choices: allTeams.map((team) => ({
                name: team.name,
                value: team.id,
                description: team.slug,
              })),
            });
            selectedTeam = allTeams.find((t) => t.id === answer);
            if (selectedTeam) {
              cloudConfig.setCurrentTeamId(selectedTeam.id, organizationId);
              logger.info(`  Team: ${chalk.cyan(selectedTeam.name)}`);
            }
          } catch {
            // User cancelled (Ctrl+C) - use default
            const defaultTeam = await getDefaultTeam();
            cloudConfig.setCurrentTeamId(defaultTeam.id, organizationId);
            logger.info(`  Team: ${chalk.cyan(defaultTeam.name)} ${chalk.dim('(default)')}`);
          }
        }
      }
    } catch (teamError) {
      logger.warn(
        `Could not set up team context: ${teamError instanceof Error ? teamError.message : String(teamError)}`,
      );
    }
  }

  authCommand
    .command('logout')
    .description('Logout')
    .action(async () => {
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
        const response = await fetchWithProxy(`${apiHost}/api/v1/users/me`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user info: ' + response.statusText);
        }

        const { user, organization } = await response.json();

        try {
          const currentTeam = await resolveTeamId();
          logger.info(dedent`
              ${chalk.green.bold('Currently logged in as:')}
              User: ${chalk.cyan(user.email)}
              Organization: ${chalk.cyan(organization.name)}
              Current Team: ${chalk.cyan(currentTeam.name)}
              App URL: ${chalk.cyan(cloudConfig.getAppUrl())}`);
        } catch (teamError) {
          logger.info(dedent`
              ${chalk.green.bold('Currently logged in as:')}
              User: ${chalk.cyan(user.email)}
              Organization: ${chalk.cyan(organization.name)}
              App URL: ${chalk.cyan(cloudConfig.getAppUrl())}`);
          logger.warn(
            `Could not determine current team: ${teamError instanceof Error ? teamError.message : String(teamError)}`,
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to get user info: ${errorMessage}`);
        process.exitCode = 1;
      }
    });

  authCommand
    .command('can-create-targets')
    .description('Check if user can create targets')
    .option('-t, --team-id <teamId>', 'The team id to check permissions for')
    .action(async (cmdObj: { teamId?: string }) => {
      try {
        if (!cloudConfig.isEnabled()) {
          logger.info(
            chalk.yellow('PromptFoo Cloud is not enabled, run `promptfoo auth login` to enable it'),
          );
          return;
        }
        if (cmdObj.teamId) {
          const canCreate = await canCreateTargets(cmdObj.teamId);
          logger.info(chalk.green(`Can create targets for team ${cmdObj.teamId}: ${canCreate}`));
        } else {
          const team = await resolveTeamId();
          const canCreate = await canCreateTargets(team.id);
          logger.info(chalk.green(`Can create targets for team ${team.name}: ${canCreate}`));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to check if user can create targets: ${errorMessage}`);
        process.exitCode = 1;
      }
    });

  // Teams management subcommands
  const teamsCommand = authCommand.command('teams').description('Manage team settings');

  teamsCommand
    .command('list')
    .description('List available teams')
    .action(async () => {
      try {
        if (!cloudConfig.isEnabled()) {
          logger.info(
            chalk.yellow('PromptFoo Cloud is not enabled, run `promptfoo auth login` to enable it'),
          );
          return;
        }

        const teams = await getUserTeams();
        const currentOrganizationId = cloudConfig.getCurrentOrganizationId();
        const currentTeamId = cloudConfig.getCurrentTeamId(currentOrganizationId);

        if (teams.length === 0) {
          logger.info('No teams found');
          return;
        }

        logger.info(chalk.green.bold('Available teams:'));
        teams.forEach((team) => {
          const isCurrent = team.id === currentTeamId;
          const marker = isCurrent ? chalk.green('●') : ' ';
          const nameColor = isCurrent ? chalk.green.bold : chalk.white;
          logger.info(`${marker} ${nameColor(team.name)} ${chalk.dim(`(${team.slug})`)}`);
        });

        if (currentTeamId) {
          const currentTeam = teams.find((t) => t.id === currentTeamId);
          if (currentTeam) {
            logger.info(`\nCurrent team: ${chalk.green(currentTeam.name)}`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to list teams: ${errorMessage}`);
        process.exitCode = 1;
      }
    });

  teamsCommand
    .command('current')
    .description('Show current team')
    .action(async () => {
      try {
        if (!cloudConfig.isEnabled()) {
          logger.info(
            chalk.yellow('PromptFoo Cloud is not enabled, run `promptfoo auth login` to enable it'),
          );
          return;
        }

        const currentOrganizationId = cloudConfig.getCurrentOrganizationId();
        const currentTeamId = cloudConfig.getCurrentTeamId(currentOrganizationId);
        if (!currentTeamId) {
          logger.info('No team currently selected');
          return;
        }

        try {
          const team = await resolveTeamId();
          logger.info(`Current team: ${chalk.green(team.name)}`);
        } catch (_error) {
          logger.warn('Stored team is no longer accessible, falling back to default');
          const team = await resolveTeamId();
          logger.info(`Current team: ${chalk.green(team.name)} ${chalk.dim('(default)')}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to get current team: ${errorMessage}`);
        process.exitCode = 1;
      }
    });

  teamsCommand
    .command('set')
    .description('Set current team')
    .argument('<team>', 'Team name, slug, or ID')
    .action(async (teamIdentifier: string) => {
      try {
        if (!cloudConfig.isEnabled()) {
          logger.info(
            chalk.yellow('PromptFoo Cloud is not enabled, run `promptfoo auth login` to enable it'),
          );
          return;
        }

        const team = await resolveTeamFromIdentifier(teamIdentifier);
        cloudConfig.setCurrentTeamId(team.id, team.organizationId);

        logger.info(chalk.green(`Switched to team: ${team.name}`));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to set team: ${errorMessage}`);
        process.exitCode = 1;
      }
    });
}
