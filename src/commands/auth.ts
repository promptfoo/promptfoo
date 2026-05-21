import input from '@inquirer/input';
import search from '@inquirer/search';
import select from '@inquirer/select';
import chalk from 'chalk';
import dedent from 'dedent';
import opener from 'opener';
import ora from 'ora';
import { isNonInteractive } from '../envars';
import { getUserEmail, setUserEmail } from '../globalConfig/accounts';
import { CLOUD_API_HOST, cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { getRequestTimeoutMs } from '../providers/shared';
import {
  canCreateTargets,
  getUserTeams,
  resolveTeamFromIdentifier,
  resolveTeamId,
} from '../util/cloud';
import { fetchWithProxy, fetchWithTimeout } from '../util/fetch/index';
import type { Command } from 'commander';

type LoginCommandOptions = {
  org?: string;
  host?: string;
  apiKey?: string;
  team?: string;
};

type UserTeam = Awaited<ReturnType<typeof getUserTeams>>[number];

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval?: number;
};

type DeviceTokenSuccessResponse = {
  access_token: string;
  token_type?: string;
};

type DeviceTokenErrorResponse = {
  error: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied' | string;
  error_description?: string;
};

type DeviceTokenResponse = DeviceTokenSuccessResponse | DeviceTokenErrorResponse;

const DEVICE_CLIENT_ID = 'promptfoo-cli';
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const DEVICE_AUTH_REQUEST_TIMEOUT_MS = getRequestTimeoutMs() ?? 300_000;

function getOrganizationTeams(
  teams: UserTeam[],
  requestedOrganizationId: string | undefined,
  fallbackOrganizationId: string,
): { organizationId: string; teams: UserTeam[] } {
  if (requestedOrganizationId) {
    const organizationTeams = teams.filter(
      (team) => team.organizationId === requestedOrganizationId,
    );

    if (
      organizationTeams.length > 0 ||
      (teams.length === 0 && requestedOrganizationId === fallbackOrganizationId)
    ) {
      return {
        organizationId: requestedOrganizationId,
        teams: organizationTeams,
      };
    }

    const organizationIds = [
      ...new Set([fallbackOrganizationId, ...teams.map((team) => team.organizationId)]),
    ].join(', ');
    throw new Error(
      `Organization '${requestedOrganizationId}' not found in your accessible teams. Available organizations: ${organizationIds}`,
    );
  }

  const fallbackOrganizationTeams = teams.filter(
    (team) => team.organizationId === fallbackOrganizationId,
  );

  if (fallbackOrganizationTeams.length > 0 || teams.length === 0) {
    return {
      organizationId: fallbackOrganizationId,
      teams: fallbackOrganizationTeams,
    };
  }

  const defaultTeam = getOldestTeam(teams);
  return {
    organizationId: defaultTeam.organizationId,
    teams: teams.filter((team) => team.organizationId === defaultTeam.organizationId),
  };
}

function getOldestTeam(teams: UserTeam[]): UserTeam {
  return [...teams].sort(
    (teamA, teamB) => new Date(teamA.createdAt).getTime() - new Date(teamB.createdAt).getTime(),
  )[0];
}

function resolveTeamFromOrganizationTeams(
  teams: UserTeam[],
  teamIdentifier: string,
  organizationId: string,
): UserTeam {
  const selectedTeam =
    teams.find((team) => team.id === teamIdentifier) ||
    teams.find((team) => team.name.toLowerCase() === teamIdentifier.toLowerCase()) ||
    teams.find((team) => team.slug === teamIdentifier);

  if (selectedTeam) {
    return selectedTeam;
  }

  const availableTeams = teams.map((team) => team.name).join(', ');
  throw new Error(
    `Team '${teamIdentifier}' not found in organization '${organizationId}'. Available teams: ${availableTeams}`,
  );
}

function resolveTeamFromTeams(teams: UserTeam[], teamIdentifier: string): UserTeam {
  const selectedTeam = teams.find((team) => team.id === teamIdentifier);
  if (selectedTeam) {
    return selectedTeam;
  }

  const nameMatch = teams.find((team) => team.name.toLowerCase() === teamIdentifier.toLowerCase());
  if (nameMatch) {
    return nameMatch;
  }

  const slugMatch = teams.find((team) => team.slug === teamIdentifier);
  if (slugMatch) {
    return slugMatch;
  }

  const availableTeams = teams.map((team) => team.name).join(', ');
  throw new Error(`Team '${teamIdentifier}' not found. Available teams: ${availableTeams}`);
}

async function setupTeamContext(
  cmdObj: LoginCommandOptions,
  organizationId: string,
  teams?: UserTeam[],
): Promise<string> {
  try {
    let currentOrganizationId = organizationId;
    let organizationTeams = teams;

    if (!organizationTeams) {
      const resolvedOrganizationTeams = getOrganizationTeams(
        await getUserTeams(),
        undefined,
        organizationId,
      );
      currentOrganizationId = resolvedOrganizationTeams.organizationId;
      organizationTeams = resolvedOrganizationTeams.teams;
    }

    cloudConfig.setCurrentOrganization(currentOrganizationId);
    cloudConfig.cacheTeams(organizationTeams, currentOrganizationId);

    let selectedTeam;
    let teamLabelSuffix = '';

    if (cmdObj.team) {
      selectedTeam = resolveTeamFromOrganizationTeams(
        organizationTeams,
        cmdObj.team,
        currentOrganizationId,
      );
    } else if (organizationTeams.length === 1) {
      selectedTeam = organizationTeams[0];
    } else if (organizationTeams.length > 1) {
      if (isNonInteractive()) {
        selectedTeam = getOldestTeam(organizationTeams);
        logger.warn(
          chalk.yellow(
            `\n⚠️  You have access to ${organizationTeams.length} teams. Using '${selectedTeam.name}'.`,
          ),
        );
        logger.info(chalk.dim(`   Use --team flag to specify: promptfoo auth login --team <name>`));
      } else {
        logger.info('');
        try {
          const answer = await search({
            message: 'Select a team to use:',
            source: async (input) => {
              const searchTerm = input?.trim().toLowerCase();
              const matchingTeams = searchTerm
                ? organizationTeams.filter(
                    (team) =>
                      team.name.toLowerCase().includes(searchTerm) ||
                      team.slug.toLowerCase().includes(searchTerm),
                  )
                : organizationTeams;

              return matchingTeams.map((team) => ({
                name: team.name,
                value: team.id,
                description: team.slug,
              }));
            },
          });
          selectedTeam = organizationTeams.find((team) => team.id === answer);
        } catch {
          selectedTeam = getOldestTeam(organizationTeams);
          teamLabelSuffix = ` ${chalk.dim('(default)')}`;
        }
      }
    }

    if (selectedTeam) {
      cloudConfig.setCurrentTeamId(selectedTeam.id, currentOrganizationId);
      logger.info(`Team: ${chalk.cyan(selectedTeam.name)}${teamLabelSuffix}`);
    }

    return currentOrganizationId;
  } catch (teamError) {
    if (cmdObj.org || cmdObj.team) {
      throw teamError;
    }
    logger.warn(
      `Could not set up team context: ${teamError instanceof Error ? teamError.message : String(teamError)}`,
    );
    return organizationId;
  }
}

async function completeCloudLogin(
  cmdObj: LoginCommandOptions,
  token: string,
  apiHost: string,
): Promise<void> {
  const { user, organization, app, hasActiveLicense } = await cloudConfig.validateApiToken(
    token,
    apiHost,
  );

  const existingEmail = getUserEmail();
  let organizationId = organization.id;
  let organizationTeams: UserTeam[] | undefined;

  if (cmdObj.org || cmdObj.team) {
    const allTeams = await getUserTeams(apiHost, token);
    const resolvedOrganizationTeams = getOrganizationTeams(allTeams, cmdObj.org, organization.id);
    organizationId = resolvedOrganizationTeams.organizationId;
    organizationTeams = resolvedOrganizationTeams.teams;

    if (cmdObj.team && !cmdObj.org) {
      const selectedTeam = resolveTeamFromTeams(allTeams, cmdObj.team);
      organizationId = selectedTeam.organizationId;
      organizationTeams = allTeams.filter((team) => team.organizationId === organizationId);
    }

    if (cmdObj.team) {
      resolveTeamFromOrganizationTeams(organizationTeams, cmdObj.team, organizationId);
    }
  }

  cloudConfig.saveValidatedApiToken(token, apiHost, user, app, hasActiveLicense);
  if (existingEmail && existingEmail !== user.email) {
    logger.info(
      chalk.yellow(`Updating local email configuration from ${existingEmail} to ${user.email}`),
    );
  }
  setUserEmail(user.email);
  cloudConfig.setCurrentOrganization(organizationId);

  organizationId = await setupTeamContext(cmdObj, organizationId, organizationTeams);

  logger.info(chalk.green.bold('Successfully logged in'));
  logger.info(`User: ${chalk.cyan(user.email)}`);
  logger.info(
    `Organization: ${chalk.cyan(organizationId === organization.id ? organization.name : organizationId)}`,
  );
  logger.info(`App: ${chalk.cyan(cloudConfig.getAppUrl())}`);
}

async function loginWithApiKey(cmdObj: LoginCommandOptions, apiHost: string): Promise<void> {
  await completeCloudLogin(cmdObj, cmdObj.apiKey!, apiHost);
}

async function requestDeviceCode(apiHost: string): Promise<DeviceCodeResponse> {
  const response = await fetchWithTimeout(
    `${apiHost}/api/v1/auth/device/code`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: DEVICE_CLIENT_ID }),
    },
    DEVICE_AUTH_REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to request device code: ${error || response.statusText}`);
  }

  return response.json();
}

async function pollForDeviceToken(
  apiHost: string,
  deviceCode: string,
  intervalSeconds: number | undefined,
  expiresInSeconds: number,
): Promise<DeviceTokenSuccessResponse> {
  const expiresAtMs = Date.now() + expiresInSeconds * 1000;
  let pollIntervalMs = (intervalSeconds ?? 5) * 1000;

  while (Date.now() < expiresAtMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const response = await fetchWithTimeout(
      `${apiHost}/api/v1/auth/device/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_code: deviceCode,
          grant_type: DEVICE_GRANT_TYPE,
          client_id: DEVICE_CLIENT_ID,
        }),
      },
      DEVICE_AUTH_REQUEST_TIMEOUT_MS,
    );

    const data = (await response.json()) as DeviceTokenResponse;

    if ('access_token' in data) {
      return data;
    }

    if (data.error === 'authorization_pending') {
      continue;
    }

    if (data.error === 'slow_down') {
      pollIntervalMs += 5000;
      continue;
    }

    if (data.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.');
    }

    if (data.error === 'access_denied') {
      throw new Error('Authorization was denied.');
    }

    throw new Error(
      data.error_description ||
        `Device authorization failed: ${response.status} ${response.statusText}`,
    );
  }

  throw new Error('Device code expired. Please try again.');
}

async function openDeviceVerificationUrl(url: string): Promise<void> {
  try {
    logger.info(`Opening ${url} in your browser...`);
    await opener(url);
  } catch (error) {
    logger.debug(`Failed to open browser automatically: ${String(error)}`);
  }
}

function validateHttpUrl(value: string): true | string {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return 'Please enter an HTTP or HTTPS URL';
    }
    return true;
  } catch {
    return 'Please enter a valid URL (e.g., https://promptfoo.yourcompany.com)';
  }
}

async function resolveDeviceAuthApiHost(cmdObj: LoginCommandOptions): Promise<string> {
  if (cmdObj.host) {
    const url = new URL(cmdObj.host);
    return url.origin;
  }

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
    return CLOUD_API_HOST;
  }

  const enterpriseUrl = await input({
    message: 'Enter your Promptfoo instance URL:',
    validate: validateHttpUrl,
  });

  return new URL(enterpriseUrl).origin;
}

async function loginWithDeviceCode(cmdObj: LoginCommandOptions): Promise<void> {
  if (isNonInteractive()) {
    logger.error(
      'Authentication required. Please set PROMPTFOO_API_KEY environment variable or use --api-key flag.',
    );
    logger.info(chalk.dim('Example: promptfoo auth login --api-key <your-api-key>'));
    process.exitCode = 1;
    return;
  }

  const apiHost = await resolveDeviceAuthApiHost(cmdObj);

  logger.info('');
  const requestingSpinner = ora({ text: 'Requesting device code...', spinner: 'dots' }).start();

  let deviceCode: DeviceCodeResponse;
  try {
    deviceCode = await requestDeviceCode(apiHost);
    requestingSpinner.succeed('Device code received');
  } catch (error) {
    requestingSpinner.fail('Failed to request device code');
    throw error;
  }

  logger.info('');
  logger.info(chalk.bold('To complete login, visit:'));
  logger.info(chalk.cyan.bold(`  ${deviceCode.verification_uri_complete}`));
  logger.info('');
  logger.info(`Or go to ${chalk.cyan(deviceCode.verification_uri)} and enter code:`);
  logger.info(chalk.yellow.bold(`  ${deviceCode.user_code}`));
  logger.info('');

  await openDeviceVerificationUrl(deviceCode.verification_uri_complete);

  const pollingSpinner = ora({ text: 'Waiting for authorization...', spinner: 'dots' }).start();

  let tokenResponse: DeviceTokenSuccessResponse;
  try {
    tokenResponse = await pollForDeviceToken(
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

  await completeCloudLogin(cmdObj, tokenResponse.access_token, apiHost);
}

export function authCommand(program: Command) {
  const authCommand = program.command('auth').description('Manage authentication');

  authCommand
    .command('login')
    .description('Login to Promptfoo Cloud or Enterprise')
    .option('-o, --org <orgId>', 'The organization id to login to.')
    .option(
      '-h, --host <host>',
      'The host of the promptfoo instance. This needs to be the url of the API if different from the app url.',
    )
    .option('-k, --api-key <apiKey>', 'Login using an API key.')
    .option(
      '-t, --team <team>',
      'The team to use (name, slug, or ID). Required in CI when multiple teams exist.',
    )
    .action(async (cmdObj: LoginCommandOptions) => {
      const apiHost = cmdObj.host || cloudConfig.getApiHost();

      try {
        if (cmdObj.apiKey) {
          await loginWithApiKey(cmdObj, apiHost);
          return;
        }

        await loginWithDeviceCode(cmdObj);
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
