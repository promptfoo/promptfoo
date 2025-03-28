import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import readline from 'readline';
import { URL } from 'url';
import { getEnvString } from '../envars';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import Eval from '../models/eval';
import { createShareableUrl } from '../share';
import telemetry from '../telemetry';
import { setupEnv } from '../util';

const askForConfirmation = async (hostname: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const reader = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    reader.question(
      `Create a private shareable URL of your eval on ${hostname}?\n\nTo proceed, please confirm [Y/n] `,
      (answer: string) => {
        reader.close();
        const confirmed =
          answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y' || answer === '';
        resolve(confirmed);
      },
    );
  });
};

export async function createAndDisplayShareableUrl(
  evalRecord: Eval,
  showAuth: boolean,
): Promise<string | null> {
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
    .option('-y, --yes', 'Skip confirmation')
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
        } else {
          eval_ = await Eval.latest();
        }
        if (!eval_) {
          logger.error('Could not load results. Do you need to run `promptfoo eval` first?');
          process.exitCode = 1;
          return;
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
        if (cmdObj.yes || getEnvString('PROMPTFOO_DISABLE_SHARE_WARNING')) {
          await createAndDisplayShareableUrl(eval_, cmdObj.showAuth);
          return;
        }

        if (cloudConfig.isEnabled()) {
          logger.info(`Sharing eval to ${cloudConfig.getAppUrl()}`);
          await createAndDisplayShareableUrl(eval_, cmdObj.showAuth);
          return;
        }

        const baseUrl =
          getEnvString('PROMPTFOO_SHARING_APP_BASE_URL') ||
          getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL');
        const hostname = baseUrl ? new URL(baseUrl).hostname : 'app.promptfoo.dev';

        const confirmed = await askForConfirmation(hostname);
        if (!confirmed) {
          process.exitCode = 1;
          return;
        }

        await createAndDisplayShareableUrl(eval_, cmdObj.showAuth);
      },
    );
}
