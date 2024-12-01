import chalk from 'chalk';
import type { Command } from 'commander';
import readline from 'readline';
import invariant from 'tiny-invariant';
import { URL } from 'url';
import { getEnvString } from '../envars';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import Eval from '../models/eval';
import { createShareableUrl } from '../share';
import telemetry from '../telemetry';
import { setupEnv } from '../util';

export async function createPublicUrl(evalRecord: Eval, showAuth: boolean) {
  const url = await createShareableUrl(evalRecord, showAuth);

  logger.info(`View results: ${chalk.greenBright.bold(url)}`);
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

          if (!eval_) {
            logger.error('Could not load results. Do you need to run `promptfoo eval` first?');
            process.exit(1);
          }
        }
        invariant(eval_, 'No eval found');
        if (cmdObj.yes || getEnvString('PROMPTFOO_DISABLE_SHARE_WARNING')) {
          await createPublicUrl(eval_, cmdObj.showAuth);
        } else {
          const reader = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          if (cloudConfig.isEnabled()) {
            logger.info(`Sharing eval to ${cloudConfig.getAppUrl()}`);
            await createPublicUrl(eval_, cmdObj.showAuth);
            process.exit(0);
          } else {
            const baseUrl = getEnvString('PROMPTFOO_SHARING_APP_BASE_URL');
            const hostname = baseUrl ? new URL(baseUrl).hostname : 'app.promptfoo.dev';
            reader.question(
              `Create a private shareable URL of your eval on ${hostname}?\n\nTo proceed, please confirm [Y/n] `,
              async function (answer: string) {
                if (
                  answer.toLowerCase() !== 'yes' &&
                  answer.toLowerCase() !== 'y' &&
                  answer !== ''
                ) {
                  reader.close();
                  process.exit(1);
                }
                reader.close();

                await createPublicUrl(eval_, cmdObj.showAuth);
              },
            );
          }
        }
      },
    );
}
