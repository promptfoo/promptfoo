import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import { DEFAULT_SHARE_VIEW_BASE_URL } from '../constants';
import logger from '../logger';
import Eval from '../models/eval';
import { createShareableUrl, isSharingEnabled } from '../share';
import telemetry from '../telemetry';
import { setupEnv } from '../util';

export function notCloudEnabledShareInstructions(): void {
  const cloudUrl = DEFAULT_SHARE_VIEW_BASE_URL;
  const welcomeUrl = `${cloudUrl}/welcome`;

  logger.info(dedent`
    
    » You need to have a cloud account to securely share your results.
    
    1. Please go to ${chalk.greenBright.bold(cloudUrl)} to sign up or login.
    2. Follow the instructions at ${chalk.greenBright.bold(welcomeUrl)} to login to the command line.
    3. Run ${chalk.greenBright.bold('promptfoo share')}
  `);
}

export async function createAndDisplayShareableUrl(
  evalRecord: Eval,
  showAuth: boolean,
): Promise<string | null> {
  if (!isSharingEnabled(evalRecord)) {
    notCloudEnabledShareInstructions();
    process.exitCode = 1;
    return null;
  }

  const url = await createShareableUrl(evalRecord, showAuth);

  if (url) {
    logger.info(`View results: ${chalk.greenBright.bold(url)}`);
  } else {
    logger.error('Failed to create shareable URL');
    process.exitCode = 1;
  }
  return url;
}

export function shareCommand(program: Command) {
  program
    .command('share [evalId]')
    .description('Create a shareable URL of an eval (defaults to most recent)' + '\n\n')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option(
      '--show-auth',
      'Show username/password authentication information in the URL if exists',
      false,
    )
    .action(
      async (
        evalId: string | undefined,
        cmdObj: { yes: boolean; envPath?: string; showAuth: boolean } & Command,
      ) => {
        setupEnv(cmdObj.envPath);
        telemetry.record('command_used', {
          name: 'share',
        });
        await telemetry.send();

        let eval_: Eval | undefined | null = null;
        if (evalId) {
          eval_ = await Eval.findById(evalId);
          if (!eval_) {
            logger.error(`Could not find eval with ID ${chalk.bold(evalId)}.`);
            process.exitCode = 1;
            return;
          }
        } else {
          eval_ = await Eval.latest();
          if (!eval_) {
            logger.error('Could not load results. Do you need to run `promptfoo eval` first?');
            process.exitCode = 1;
            return;
          }
        }

        if (eval_.prompts.length === 0) {
          // FIXME(ian): Handle this on the server side.
          logger.error(
            dedent`
              Eval ${chalk.bold(eval_.id)} cannot be shared.
              This may be because the eval is still running or because it did not complete successfully.
              If your eval is still running, wait for it to complete and try again.
            `,
          );
          process.exitCode = 1;
          return;
        }

        await createAndDisplayShareableUrl(eval_, cmdObj.showAuth);
      },
    );
}
