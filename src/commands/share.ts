import chalk from 'chalk';
import type { Command } from 'commander';
import readline from 'readline';
import { URL } from 'url';
import { getEnvString } from '../envars';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { createShareableUrl } from '../share';
import telemetry from '../telemetry';
import type { ResultsFile } from '../types';
import { getLatestEval, readResult, setupEnv } from '../util';

export async function createPublicUrl(results: ResultsFile, showAuth: boolean) {
  const url = await createShareableUrl(results.results, results.config, showAuth);
  logger.info(`View results: ${chalk.greenBright.bold(url)}`);
  return url;
}

export function shareCommand(program: Command) {
  program
    .command('share [evalId]')
    .description('Create a shareable URL of an eval (defaults to most recent)')
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

        let results;
        if (evalId) {
          results = (await readResult(evalId))?.result;
          if (!results) {
            logger.error(`Could not load results for eval ID ${evalId}.`);
            process.exit(1);
          }
        } else {
          results = await getLatestEval();
          if (!results) {
            logger.error('Could not load results. Do you need to run `promptfoo eval` first?');
            process.exit(1);
          }
        }

        if (cmdObj.yes || getEnvString('PROMPTFOO_DISABLE_SHARE_WARNING')) {
          await createPublicUrl(results, cmdObj.showAuth);
        } else {
          const reader = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const baseUrl = getEnvString('PROMPTFOO_SHARING_APP_BASE_URL');
          const hostname = baseUrl ? new URL(baseUrl).hostname : 'app.promptfoo.dev';
          if (cloudConfig.isEnabled()) {
            logger.info(`Sharing eval to ${cloudConfig.getAppUrl()}`);
            await createPublicUrl(results, cmdObj.showAuth);
            process.exit(0);
          } else {
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

                await createPublicUrl(results, cmdObj.showAuth);
              },
            );
          }
        }
      },
    );
}
