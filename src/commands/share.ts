import chalk from 'chalk';
import { Command } from 'commander';
import readline from 'readline';
import logger from '../logger';
import { createShareableUrl } from '../share';
import telemetry from '../telemetry';
import { setupEnv } from '../util';
import { readLatestResults } from '../util';

export function shareCommand(program: Command) {
  program
    .command('share')
    .description('Create a shareable URL of your most recent eval')
    .option('-y, --yes', 'Skip confirmation')
    .option('--env-file <path>', 'Path to .env file')
    .action(async (cmdObj: { yes: boolean; envFile?: string } & Command) => {
      setupEnv(cmdObj.envFile);
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'share',
      });
      await telemetry.send();

      const createPublicUrl = async () => {
        const latestResults = await readLatestResults();
        if (!latestResults) {
          logger.error('Could not load results. Do you need to run `promptfoo eval` first?');
          process.exit(1);
        }
        const url = await createShareableUrl(latestResults.results, latestResults.config);
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
          `Create a private shareable URL of your most recent eval on ${hostname}?\n\nTo proceed, please confirm [Y/n] `,
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
    });
}
