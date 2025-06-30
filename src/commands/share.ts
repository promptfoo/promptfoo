import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import { getDefaultShareViewBaseUrl } from '../constants';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import Eval from '../models/eval';
import { createShareableUrl, hasEvalBeenShared, isSharingEnabled, getShareableUrl } from '../share';
import telemetry from '../telemetry';
import { loadDefaultConfig } from '../util/config/default';

export function notCloudEnabledShareInstructions(): void {
  const cloudUrl = getDefaultShareViewBaseUrl();
  const welcomeUrl = `${cloudUrl}/welcome`;

  logger.info(dedent`
    
    » You need to have a cloud account to securely share your results.
    
    1. Please go to ${chalk.greenBright.bold(cloudUrl)} to sign up or log in.
    2. Follow the instructions at ${chalk.greenBright.bold(welcomeUrl)} to login to the command line.
    3. Run ${chalk.greenBright.bold('promptfoo share')}
  `);
}

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
    .option(
      '--show-auth',
      'Show username/password authentication information in the URL if exists',
      false,
    )
    // NOTE: Added in 0.109.1 after migrating sharing to promptfoo.app in 0.108.0
    .option(
      '-y, --yes',
      'Flag does nothing (maintained for backwards compatibility only - shares are now private by default)',
      false,
    )
    .action(
      async (
        evalId: string | undefined,
        cmdObj: { yes: boolean; envPath?: string; showAuth: boolean } & Command,
      ) => {
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
          logger.info(`Sharing latest eval (${eval_.id})`);
        }

        try {
          const { defaultConfig: currentConfig } = await loadDefaultConfig();
          if (currentConfig && currentConfig.sharing) {
            eval_.config.sharing = currentConfig.sharing;
            logger.debug(
              `Applied sharing config from promptfooconfig.yaml: ${JSON.stringify(currentConfig.sharing)}`,
            );
          }
        } catch (err) {
          logger.debug(`Could not load config: ${err}`);
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

        // Validate that the user has authenticated with Cloud.
        if (!isSharingEnabled(eval_)) {
          notCloudEnabledShareInstructions();
          process.exitCode = 1;
          return;
        }

        if (
          // Idempotency is not implemented in self-hosted mode.
          cloudConfig.isEnabled() &&
          (await hasEvalBeenShared(eval_))
        ) {
          const url = await getShareableUrl(eval_, cmdObj.showAuth);
          const shouldContinue = await confirm({
            message: `This eval is already shared at ${url}. Sharing it again will overwrite the existing data. Continue?`,
          });
          if (!shouldContinue) {
            process.exitCode = 0;
            return;
          }
        }

        await createAndDisplayShareableUrl(eval_, cmdObj.showAuth);
      },
    );
}
