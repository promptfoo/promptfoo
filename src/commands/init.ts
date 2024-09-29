import confirm from '@inquirer/confirm';
import type { Command } from 'commander';
import logger from '../logger';
import { initializeProject } from '../onboarding';
import telemetry from '../telemetry';

export function initCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Initialize project with dummy files')
    .option('--no-interactive', 'Do not run in interactive mode')
    .action(async (directory: string | null, cmdObj: { interactive: boolean }) => {
      telemetry.record('command_used', {
        name: 'init - started',
      });

      if (directory === 'redteam' && cmdObj.interactive) {
        const useRedteam = await confirm({
          message:
            'You specified "redteam" as the directory. Did you mean to write "promptfoo redteam init" instead?',
          default: false,
        });
        if (useRedteam) {
          logger.warn('Please use "promptfoo redteam init" to initialize a red teaming project.');
          return;
        }
      }

      const details = await initializeProject(directory, cmdObj.interactive);
      telemetry.record('command_used', {
        ...details,
        name: 'init',
      });
      await telemetry.send();
    });
}
