import confirm from '@inquirer/confirm';
import { z } from 'zod';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import telemetry from '../../telemetry';

const EmailSchema = z.string().email();

export async function getEmailAction(): Promise<void> {
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
}

export async function setEmailAction(email: string): Promise<void> {
  if (cloudConfig.getApiKey()) {
    logger.error(
      "Cannot update email while logged in. Email is managed through 'promptfoo auth login'. Please use 'promptfoo auth logout' first if you want to use a different email.",
    );
    process.exitCode = 1;
    return;
  }

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
}

export async function unsetEmailAction(options: { force?: boolean }): Promise<void> {
  if (cloudConfig.getApiKey()) {
    logger.error(
      "Cannot update email while logged in. Email is managed through 'promptfoo auth login'. Please use 'promptfoo auth logout' first if you want to use a different email.",
    );
    process.exitCode = 1;
    return;
  }

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
}
