import confirm from '@inquirer/confirm';
import type { Command } from 'commander';
import { z } from 'zod';
import { getUserEmail, setUserEmail } from '../globalConfig/accounts';
import logger from '../logger';
import telemetry from '../telemetry';

const EmailSchema = z.string().email();

export function configCommand(program: Command) {
  const configCommand = program.command('config').description('Edit configuration settings');
  const getCommand = configCommand.command('get').description('Get configuration settings');
  const setCommand = configCommand.command('set').description('Set configuration settings');
  const unsetCommand = configCommand.command('unset').description('Unset configuration settings');

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
      const parsedEmail = EmailSchema.safeParse(email);
      if (!parsedEmail.success) {
        logger.error(`Invalid email address: ${email}`);
        process.exitCode = 1;
        return;
      }
      setUserEmail(parsedEmail.data);
      logger.info(`Email set to ${parsedEmail.data}`);
      telemetry.record('command_used', {
        name: 'config set',
        configKey: 'email',
      });
      await telemetry.send();
    });

  unsetCommand
    .command('email')
    .description('Unset user email')
    .option('-f, --force', 'Force unset without confirmation')
    .action(async (options) => {
      const currentEmail = getUserEmail();
      if (!currentEmail) {
        logger.info('No email is currently set.');
        return;
      }

      if (!options.force) {
        const shouldUnset = await confirm({
          message: `Are you sure you want to unset the email "${currentEmail}"?`,
          default: false,
        });

        if (!shouldUnset) {
          logger.info('Operation cancelled.');
          return;
        }
      }

      setUserEmail('');
      logger.info('Email has been unset.');
      telemetry.record('command_used', {
        name: 'config unset',
        configKey: 'email',
      });
      await telemetry.send();
    });
}
