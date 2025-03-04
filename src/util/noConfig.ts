import confirm from '@inquirer/confirm';
import dedent from 'dedent';
import logger from '../logger';
import { isRunningUnderNpx } from '../util';

// Initialize a project callback type - will be provided by the code that uses this module
type InitializeProjectCallback = (directory: string | null, interactive: boolean) => Promise<void>;

// Default no-op implementation
const defaultInitializer: InitializeProjectCallback = async () => {
  logger.info('No project initializer provided');
  process.exit(0);
};

// Store the initializer function - can be set later by the application
let projectInitializer: InitializeProjectCallback = defaultInitializer;

/**
 * Set the project initializer function to be used when the user chooses to initialize a project
 * This function is called by the application to inject the initialization functionality
 * @param initializer The function to call for project initialization
 */
export function setProjectInitializer(initializer: InitializeProjectCallback): void {
  projectInitializer = initializer;
}

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
    // Use the injected initializer instead of direct import
    await projectInitializer(null, true);
    process.exit(0);
  }
  process.exit(1);
}
