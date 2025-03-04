import confirm from '@inquirer/confirm';
import dedent from 'dedent';
import logger from '../logger';
import { initializeProject } from '../onboarding';
import { isRunningUnderNpx } from '../util';

/**
 * Handles the case when no configuration is found.
 * Offers to initialize a new project if not in CI mode.
 * @returns {Promise<never>} This function always exits the process.
 */
export async function handleNoConfiguration(): Promise<never> {
  const runCommand = isRunningUnderNpx() ? 'npx promptfoo eval' : 'promptfoo eval';

  logger.warn(dedent`
    No promptfooconfig found. Try running with:

    ${runCommand} -c path/to/promptfooconfig.yaml

    Or create a config with:

    ${runCommand} init`);

  const shouldInit = await confirm({
    message: 'Would you like to initialize a new project?',
    default: true,
  });

  if (shouldInit) {
    await initializeProject(null, true);
    process.exit(0);
  }
  process.exit(1);
}
