import confirm from '@inquirer/confirm';
import { Command } from 'commander';
import { configCommand } from '../../src/commands/config';
import { getUserEmail, setUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
import telemetry from '../../src/telemetry';

jest.mock('../../src/globalConfig/accounts');
jest.mock('../../src/globalConfig/cloud');
jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
  send: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@inquirer/confirm');

describe('config command', () => {
  let program: Command;

  beforeEach(() => {
    jest.clearAllMocks();
    program = new Command();
    configCommand(program);
  });

  describe('set email', () => {
    it('should not allow setting email when user is logged in', async () => {
      // Mock logged in state
      jest.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key');

      // Execute set email command
      const setEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'set')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await setEmailCmd?.parseAsync(['node', 'test', 'new@example.com']);

      // Verify email was not set and error was shown
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "Cannot update email while logged in. Email is managed through 'promptfoo auth login'",
        ),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should allow setting email when user is not logged in', async () => {
      // Mock logged out state
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);

      // Execute set email command
      const setEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'set')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await setEmailCmd?.parseAsync(['node', 'test', 'test@example.com']);

      // Verify email was set
      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Email set to test@example.com'),
      );
      expect(telemetry.record).toHaveBeenCalledWith('command_used', {
        name: 'config set',
        configKey: 'email',
      });
      expect(telemetry.send).toHaveBeenCalledWith();
    });

    it('should validate email format even when not logged in', async () => {
      // Mock logged out state
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);

      // Execute set email command with invalid email
      const setEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'set')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await setEmailCmd?.parseAsync(['node', 'test', 'invalid-email']);

      // Verify email was not set and error was shown
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid email address'));
      expect(process.exitCode).toBe(1);
      expect(telemetry.record).not.toHaveBeenCalled();
      expect(telemetry.send).not.toHaveBeenCalled();
    });
  });

  describe('unset email', () => {
    it('should not allow unsetting email when user is logged in', async () => {
      // Mock logged in state
      jest.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key');
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');

      // Execute unset email command
      const unsetEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'unset')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await unsetEmailCmd?.parseAsync(['node', 'test']);

      // Verify email was not unset and error was shown
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "Cannot update email while logged in. Email is managed through 'promptfoo auth login'",
        ),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should allow unsetting email when user is not logged in with force flag', async () => {
      // Mock logged out state
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');

      // Execute unset email command with force flag
      const unsetEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'unset')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await unsetEmailCmd?.parseAsync(['node', 'test', '--force']);

      // Verify email was unset
      expect(setUserEmail).toHaveBeenCalledWith('');
      expect(logger.info).toHaveBeenCalledWith('Email has been unset.');
      expect(telemetry.record).toHaveBeenCalledWith('command_used', {
        name: 'config unset',
        configKey: 'email',
      });
      expect(telemetry.send).toHaveBeenCalledWith();
    });

    it('should handle user confirmation for unsetting email', async () => {
      // Mock logged out state and user confirmation
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(confirm).mockResolvedValueOnce(true);

      // Execute unset email command without force flag
      const unsetEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'unset')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await unsetEmailCmd?.parseAsync(['node', 'test']);

      // Verify email was unset after confirmation
      expect(confirm).toHaveBeenCalledWith({
        message: 'Are you sure you want to unset the email "test@example.com"?',
        default: false,
      });
      expect(setUserEmail).toHaveBeenCalledWith('');
      expect(logger.info).toHaveBeenCalledWith('Email has been unset.');
    });

    it('should handle user cancellation for unsetting email', async () => {
      // Mock logged out state and user cancellation
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(confirm).mockResolvedValueOnce(false);

      // Execute unset email command without force flag
      const unsetEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'unset')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await unsetEmailCmd?.parseAsync(['node', 'test']);

      // Verify operation was cancelled
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Operation cancelled.');
      expect(telemetry.record).not.toHaveBeenCalled();
      expect(telemetry.send).not.toHaveBeenCalled();
    });

    it('should handle case when no email is set', async () => {
      // Mock logged out state and no existing email
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);
      jest.mocked(getUserEmail).mockReturnValue(null);

      // Execute unset email command
      const unsetEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'unset')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await unsetEmailCmd?.parseAsync(['node', 'test']);

      // Verify appropriate message was shown
      expect(logger.info).toHaveBeenCalledWith('No email is currently set.');
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(telemetry.record).not.toHaveBeenCalled();
      expect(telemetry.send).not.toHaveBeenCalled();
    });
  });

  describe('get email', () => {
    it('should show email when it exists', async () => {
      // Mock existing email
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');

      // Execute get email command
      const getEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'get')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await getEmailCmd?.parseAsync(['node', 'test']);

      // Verify email was shown and telemetry was recorded
      expect(logger.info).toHaveBeenCalledWith('test@example.com');
      expect(telemetry.record).toHaveBeenCalledWith('command_used', {
        name: 'config get',
        configKey: 'email',
      });
      expect(telemetry.send).toHaveBeenCalledWith();
    });

    it('should show message when no email is set', async () => {
      // Mock no existing email
      jest.mocked(getUserEmail).mockReturnValue(null);

      // Execute get email command
      const getEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'get')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await getEmailCmd?.parseAsync(['node', 'test']);

      // Verify message was shown and telemetry was recorded
      expect(logger.info).toHaveBeenCalledWith('No email set.');
      expect(telemetry.record).toHaveBeenCalledWith('command_used', {
        name: 'config get',
        configKey: 'email',
      });
      expect(telemetry.send).toHaveBeenCalledWith();
    });
  });
});
