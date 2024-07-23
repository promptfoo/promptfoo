import chalk from 'chalk';
import { Command } from 'commander';
import readline from 'readline';
import logger from '../logger';
import { createShareableUrl } from '../share';
import telemetry from '../telemetry';
import { readLatestResults, readResult, setupEnv } from '../util';

export function shareCommand(program: Command) {
  program
    .command('share [evalId]')
    .description('Create a shareable URL of an eval (defaults to most recent)')
    .option('-y, --yes', 'Skip confirmation')
    .option('--env-file <path>', 'Path to .env file')
    .action(
      async (evalId: string | undefined, cmdObj: { yes: boolean; envFile?: string } & Command) => {
        setupEnv(cmdObj.envFile);
        telemetry.maybeShowNotice();
        telemetry.record('command_used', {
          name: 'share',
        });
        await telemetry.send();

        const createPublicUrl = async () => {
          let results;
          if (evalId) {
            results = (await readResult(evalId))?.result;
            if (!results) {
              logger.error(`Could not load results for eval ID ${evalId}.`);
              process.exit(1);
            }
          } else {
            results = await readLatestResults();
            if (!results) {
              logger.error('Could not load results. Do you need to run `promptfoo eval` first?');
              process.exit(1);
            }
          }
          const url = await createShareableUrl(results.results, results.config);
          logger.info(`View results: ${chalk.greenBright.bold(url)}`);
        };

        if (cmdObj.yes || process.env.PROMPTFOO_DISABLE_SHARE_WARNING) {
          createPublicUrl();
        } else {
          const reader = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const hostname = process.env.PROMPTFOO_SHARING_APP_BASE_URL
            ? new URL(process.env.PROMPTFOO_SHARING_APP_BASE_URL).hostname
            : 'app.promptfoo.dev';

          reader.question(
            `Create a private shareable URL of your eval on ${hostname}?\n\nTo proceed, please confirm [Y/n] `,
            async function (answer: string) {
              if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y' && answer !== '') {
                reader.close();
                process.exit(1);
              }
              reader.close();

              createPublicUrl();
            },
          );
        }
      },
    );
}
