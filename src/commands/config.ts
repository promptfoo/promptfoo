import { Command } from 'commander';

import { getUserEmail, setUserEmail } from '../accounts';
import logger from '../logger';

export function configCommand(program: Command) {
  const configCommand = program.command('config').description('Edit configuration settings');
  const getCommand = configCommand.command('get').description('Get configuration settings.');
  const setCommand = configCommand.command('set').description('Set configuration settings.');

  getCommand
    .command('email')
    .description('Get user email')
    .action(() => {
      const email = getUserEmail();
      if (email) {
        logger.info(email);
      } else {
        logger.info('No email set.');
      }
    });

  setCommand
    .command('email <email>')
    .description('Set user email')
    .action((email: string) => {
      setUserEmail(email);
      if (email) {
        logger.info(`Email set to ${email}`);
      } else {
        logger.info('Email unset.');
      }
    });
}
