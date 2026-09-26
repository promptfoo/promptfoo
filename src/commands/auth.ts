import search from '@inquirer/search';
import chalk from 'chalk';
import dedent from 'dedent';
import { isNonInteractive } from '../envars';
import { getUserEmail } from '../globalConfig/accounts';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import {
  canCreateTargets,
  getCloudOrganizationLabel,
  getOldestTeam,
  getUserTeams,
  resolveTeamFromIdentifier,
  resolveTeamId,
} from '../util/cloud';
import { loginWithApiKey } from '../util/cloudLogin';
import { fetchWithProxy } from '../util/fetch/index';
import { sanitizeUrlForLogging } from '../util/sanitizer';
import { BrowserBehavior, openAuthBrowser } from '../util/server';
import type { Command } from 'commander';

type LoginCommandOptions = {
  org?: string;
  host?: string;
  apiKey?: string;
  team?: string;
  authHeaderName?: string;
};

type UserTeam = Awaited<ReturnType<typeof getUserTeams>>[number];

async function selectLoginTeam(teams: UserTeam[]): Promise<UserTeam> {
  if (isNonInteractive()) {
    const selectedTeam = getOldestTeam(teams);
    logger.warn(
      chalk.yellow(`\n⚠️  You have access to ${teams.length} teams. Using '${selectedTeam.name}'.`),
    );
    logger.info(chalk.dim(`   Use 'promptfoo auth teams set <team>' to change teams.`));
    return selectedTeam;
  }

  logger.info('');
  try {
    const answer = await search({
      message: 'Select a team to use:',
      source: async (input) => {
        const searchTerm = input?.trim().toLowerCase();
        const matchingTeams = searchTerm
          ? teams.filter(
              (team) =>
                team.name.toLowerCase().includes(searchTerm) ||
                team.slug.toLowerCase().includes(searchTerm),
            )
          : teams;
        return matchingTeams.map((team) => ({
          name: team.name,
          value: team.id,
          description: team.slug,
        }));
      },
    });
    return teams.find((team) => team.id === answer) ?? getOldestTeam(teams);
  } catch {
    return getOldestTeam(teams);
  }
}

async function loginFromCommand(cmdObj: LoginCommandOptions, apiHost?: string): Promise<void> {
  const existingEmail = getUserEmail();
  const { user, organization, organizationId, team } = await loginWithApiKey(
    cmdObj.apiKey!,
    apiHost,
    {
      authHeaderName: cmdObj.authHeaderName,
      organizationId: cmdObj.org,
      teamIdentifier: cmdObj.team,
      selectTeam: selectLoginTeam,
    },
  );
  if (existingEmail && existingEmail !== user.email) {
    logger.info(
      chalk.yellow(`Updating local email configuration from ${existingEmail} to ${user.email}`),
    );
  }
  if (team) {
    logger.info(`Team: ${chalk.cyan(team.name)}`);
  }
  logger.info(chalk.green.bold('Successfully logged in'));
  logger.info(`User: ${chalk.cyan(user.email)}`);
  logger.info(
    `Organization: ${chalk.cyan(getCloudOrganizationLabel(organization, organizationId))}`,
  );
  logger.info(`App: ${chalk.cyan(cloudConfig.getAppUrl())}`);
}

async function loginWithBrowser(cmdObj: LoginCommandOptions): Promise<void> {
  const appUrl = cmdObj.host || cloudConfig.getAppUrl();
  const authUrl = new URL(appUrl);
  const welcomeUrl = new URL('/welcome', appUrl);

  if (isNonInteractive()) {
    logger.error(
      'No API key supplied. Run `promptfoo auth login --api-key <apiKey>` to save a login. For environment-only authentication, set PROMPTFOO_API_KEY and run the desired command directly.',
    );
    logger.info(`Manual login URL: ${chalk.green(authUrl.toString())}`);
    logger.info(`After login, get your API token at: ${chalk.green(welcomeUrl.toString())}`);
    process.exitCode = 1;
    return;
  }

  await openAuthBrowser(authUrl.toString(), welcomeUrl.toString(), BrowserBehavior.ASK);
  const hostOption = cmdObj.host ? ' --host <your-api-host>' : '';
  logger.info(
    `To finish CLI login, copy your API key and run: promptfoo auth login --api-key <apiKey>${hostOption}`,
  );
}

export function authCommand(program: Command) {
  const authCommand = program.command('auth').description('Manage authentication');

  authCommand
    .command('login')
    .description('Save an API key login, or open the browser to obtain a key')
    .option('-o, --org <orgId>', 'Organization ID to use with --api-key.')
    .option(
      '-h, --host <host>',
      'The host of the promptfoo instance. This needs to be the url of the API if different from the app url.',
    )
    .option('-k, --api-key <apiKey>', 'Login using an API key.')
    .option('-t, --team <team>', 'Team name, slug, or ID to use with --api-key.')
    .option(
      '--auth-header-name <name>',
      'Cloud auth header (overrides the saved setting and PROMPTFOO_CLOUD_AUTH_HEADER; otherwise defaults to Authorization).',
    )
    .action(async (cmdObj: LoginCommandOptions) => {
      try {
        if (cmdObj.apiKey) {
          await loginFromCommand(cmdObj, cmdObj.host);
          return;
        }

        await loginWithBrowser(cmdObj);
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
      try {
        const email = getUserEmail();
        const apiKey = cloudConfig.getApiKey();
        // Clear remembered context even if an environment credential was already removed.
        await cloudConfig.delete();
        if (!email && !apiKey) {
          logger.info(chalk.yellow("You're already logged out - no active session to terminate"));
          return;
        }
        if (cloudConfig.isEnabled()) {
          logger.warn(
            'Saved credentials cleared. PROMPTFOO_API_KEY still provides authentication; unset it to log out completely.',
          );
        } else {
          logger.info(chalk.green('Successfully logged out'));
        }
      } catch (error) {
        logger.error('Logout failed; saved credentials could not be cleared.', { error });
        process.exitCode = 1;
      }
    });

  authCommand
    .command('whoami')
    .description('Show current user information')
    .action(async () => {
      try {
        const { apiHost, authHeaderName, headers } = cloudConfig.getRequestConfig();
        logger.info(dedent`
            API URL: ${chalk.cyan(sanitizeUrlForLogging(apiHost))}
            Auth header: ${chalk.cyan(authHeaderName)}`);

        if (!headers) {
          logger.info(`Not logged in. Run ${chalk.bold('promptfoo auth login')} to login.`);
          return;
        }

        const response = await fetchWithProxy(`${apiHost}/api/v1/users/me`, {
          headers,
          skipCloudAuthInjection: true,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user info: ' + response.statusText);
        }

        const { user, organization } = await response.json();
        const organizationLabel = getCloudOrganizationLabel(organization);

        try {
          const currentTeam = await resolveTeamId();
          logger.info(dedent`
              ${chalk.green.bold('Currently logged in as:')}
              User: ${chalk.cyan(user.email)}
              Organization: ${chalk.cyan(organizationLabel)}
              Current Team: ${chalk.cyan(currentTeam.name)}
              App URL: ${chalk.cyan(cloudConfig.getAppUrl())}`);
        } catch (teamError) {
          logger.info(dedent`
              ${chalk.green.bold('Currently logged in as:')}
              User: ${chalk.cyan(user.email)}
              Organization: ${chalk.cyan(organizationLabel)}
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
          logger.info(
            `${marker} ${nameColor(team.name)} ${chalk.dim(`(${team.slug})`)}  ID: ${team.id}  Organization: ${team.organizationId}`,
          );
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

        if (!cloudConfig.getCurrentTeamId(cloudConfig.getCurrentOrganizationId())) {
          logger.info('No team currently selected');
          return;
        }

        // Shares the fallback used by whoami and red team generation, which never switches
        // organizations; a stale team is replaced only after a successful lookup.
        const team = await resolveTeamId();
        logger.info(`Current team: ${chalk.green(team.name)}`);
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

        const previousOrganizationId = cloudConfig.getCurrentOrganizationId();
        const team = await resolveTeamFromIdentifier(teamIdentifier);
        // The team only takes effect in its own organization, so switch to it as well.
        cloudConfig.setCurrentOrganization(team.organizationId);
        cloudConfig.setCurrentTeamId(team.id, team.organizationId);

        const organizationNote =
          team.organizationId === previousOrganizationId
            ? ''
            : ` (organization ${team.organizationId})`;
        logger.info(chalk.green(`Switched to team: ${team.name}${organizationNote}`));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to set team: ${errorMessage}`);
        process.exitCode = 1;
      }
    });
}
