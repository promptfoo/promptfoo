import chalk from 'chalk';
import dedent from 'dedent';
import { getDefaultShareViewBaseUrl } from '../constants';
import logger from '../logger';

/**
 * Prints the cloud-signup instructions shown when sharing is attempted without
 * a cloud account. Lives in the node layer so both the share CLI command and
 * the eval runner can use it without a cli-layer dependency.
 */
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
