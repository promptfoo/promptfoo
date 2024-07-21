import confirm from '@inquirer/confirm';
import { Command } from 'commander';
import logger from '../logger';
import { createDummyFiles } from '../onboarding';
import telemetry from '../telemetry';

export function initCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Initialize project with dummy files')
    .option('--no-interactive', 'Run in interactive mode')
    .action(async (directory: string | null, cmdObj: { interactive: boolean }) => {
      telemetry.maybeShowNotice();
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

      const details = await createDummyFiles(directory, cmdObj.interactive);
      telemetry.record('command_used', {
        ...details,
        name: 'init',
      });
      await telemetry.send();
    });
}
