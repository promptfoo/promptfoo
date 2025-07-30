import type { Command } from 'commander';

export function configCommand(program: Command) {
  const configCommand = program.command('config').description('Edit configuration settings');
  const getCommand = configCommand.command('get').description('Get configuration settings');
  const setCommand = configCommand.command('set').description('Set configuration settings');
  const unsetCommand = configCommand.command('unset').description('Unset configuration settings');

  getCommand
    .command('email')
    .description('Get user email')
    .action(async () => {
      const { getEmailAction } = await import('./config/configAction');
      await getEmailAction();
    });

  setCommand
    .command('email <email>')
    .description('Set user email')
    .action(async (email: string) => {
      const { setEmailAction } = await import('./config/configAction');
      await setEmailAction(email);
    });

  unsetCommand
    .command('email')
    .option('-f, --force', 'Force unset without confirmation')
    .description('Unset user email')
    .action(async (options: { force?: boolean }) => {
      const { unsetEmailAction } = await import('./config/configAction');
      await unsetEmailAction(options);
    });
}
