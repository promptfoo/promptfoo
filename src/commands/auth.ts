import select from '@inquirer/select';
import chalk from 'chalk';
import dedent from 'dedent';
import { isNonInteractive } from '../envars';
import { getUserEmail, setUserEmail } from '../globalConfig/accounts';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import {
  canCreateTargets,
  getDefaultTeam,
  getUserTeams,
  resolveTeamFromIdentifier,
  resolveTeamId,
} from '../util/cloud';
import { fetchWithProxy } from '../util/fetch/index';
import { BrowserBehavior, openAuthBrowser } from '../util/server';
import type { Command } from 'commander';

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
    .option(
      '-t, --team <team>',
      'The team to use (name, slug, or ID). Required in CI when multiple teams exist.',
    )
    .action(async (cmdObj: { orgId: string; host: string; apiKey: string; team?: string }) => {
      let token: string | undefined;
      const apiHost = cmdObj.host || cloudConfig.getApiHost();

      try {
        if (cmdObj.apiKey) {
          token = cmdObj.apiKey;
          const { user, organization } = await cloudConfig.validateAndSetApiToken(token, apiHost);
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

          // Set current organization context
          cloudConfig.setCurrentOrganization(organization.id);

          // Display login success with user/org info
          logger.info(chalk.green.bold('Successfully logged in'));
          logger.info(`User: ${chalk.cyan(user.email)}`);
          logger.info(`Organization: ${chalk.cyan(organization.name)}`);
          logger.info(`App: ${chalk.cyan(cloudConfig.getAppUrl())}`);

          // Set up team
          try {
            const allTeams = await getUserTeams();
            cloudConfig.cacheTeams(allTeams, organization.id);

            let selectedTeam;

            if (cmdObj.team) {
              // --team flag provided: use specified team
              selectedTeam = await resolveTeamFromIdentifier(cmdObj.team);
              cloudConfig.setCurrentTeamId(selectedTeam.id, organization.id);
              logger.info(`Team: ${chalk.cyan(selectedTeam.name)}`);
            } else if (allTeams.length === 1) {
              // Single team: just use it
              selectedTeam = allTeams[0];
              cloudConfig.setCurrentTeamId(selectedTeam.id, organization.id);
              logger.info(`Team: ${chalk.cyan(selectedTeam.name)}`);
            } else if (allTeams.length > 1) {
              // Multiple teams
              if (isNonInteractive()) {
                // Non-interactive (CI): use default team but warn
                const defaultTeam = await getDefaultTeam();
                cloudConfig.setCurrentTeamId(defaultTeam.id, organization.id);
                logger.info(`Team: ${chalk.cyan(defaultTeam.name)}`);
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
                    cloudConfig.setCurrentTeamId(selectedTeam.id, organization.id);
                    logger.info(`\nTeam: ${chalk.cyan(selectedTeam.name)}`);
                  }
                } catch {
                  // User cancelled (Ctrl+C) - use default
                  const defaultTeam = await getDefaultTeam();
                  cloudConfig.setCurrentTeamId(defaultTeam.id, organization.id);
                  logger.info(`\nTeam: ${chalk.cyan(defaultTeam.name)} ${chalk.dim('(default)')}`);
                }
              }
            }
          } catch (teamError) {
            logger.warn(
              `Could not set up team context: ${teamError instanceof Error ? teamError.message : String(teamError)}`,
            );
          }
          return;
        } else {
          // Use host parameter if provided, otherwise use stored app URL
          const appUrl = cmdObj.host || cloudConfig.getAppUrl();
          const authUrl = new URL(appUrl);
          const welcomeUrl = new URL('/welcome', appUrl);

          if (isNonInteractive()) {
            // CI Environment or non-interactive: Exit with error but show manual URLs
            logger.error(
              'Authentication required. Please set PROMPTFOO_API_KEY environment variable or run `promptfoo auth login` in an interactive environment.',
            );
            logger.info(`Manual login URL: ${chalk.green(authUrl.toString())}`);
            logger.info(
              `After login, get your API token at: ${chalk.green(welcomeUrl.toString())}`,
            );
            process.exitCode = 1;
            return;
          }

          // Interactive Environment: Offer to open browser
          await openAuthBrowser(authUrl.toString(), welcomeUrl.toString(), BrowserBehavior.ASK);
          return;
        }

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
