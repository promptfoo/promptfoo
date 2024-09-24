import type { Command } from 'commander';
import { getUserEmail, setUserEmail } from '../globalConfig/accounts';
import logger from '../logger';
import telemetry from '../telemetry';

export function configCommand(program: Command) {
  const configCommand = program.command('config').description('Edit configuration settings');
  const getCommand = configCommand.command('get').description('Get configuration settings.');
  const setCommand = configCommand.command('set').description('Set configuration settings.');

  getCommand
    .command('email')
    .description('Get user email')
    .action(async () => {
      const email = getUserEmail();
      if (email) {
        logger.info(email);
      } else {
        logger.info('No email set.');
      }
      telemetry.record('command_used', {
        name: 'config get',
        configKey: 'email',
      });
      await telemetry.send();
    });

  setCommand
    .command('email <email>')
    .description('Set user email')
    .action(async (email: string) => {
      setUserEmail(email);
      if (email) {
        logger.info(`Email set to ${email}`);
      } else {
        logger.info('Email unset.');
      }
      telemetry.record('command_used', {
        name: 'config set',
        configKey: 'email',
      });
      await telemetry.send();
    });
}
