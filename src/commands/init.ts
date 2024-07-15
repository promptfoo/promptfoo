import { Command } from 'commander';
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
      const details = await createDummyFiles(directory, cmdObj.interactive);
      telemetry.record('command_used', {
        ...details,
        name: 'init',
      });
      await telemetry.send();
    });
}
