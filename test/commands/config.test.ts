import { Command } from 'commander';
import { configCommand } from '../../src/commands/config';
import { getUserEmail, setUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';

jest.mock('../../src/globalConfig/accounts');
jest.mock('../../src/globalConfig/cloud');
jest.mock('../../src/logger');
jest.mock('../../src/telemetry');

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
    });

    it('should allow setting email when user is not logged in', async () => {
      // Mock logged out state
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(null);

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
    });

    it('should validate email format even when not logged in', async () => {
      // Mock logged out state
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(null);

      // Execute set email command with invalid email
      const setEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'set')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await setEmailCmd?.parseAsync(['node', 'test', 'invalid-email']);

      // Verify email was not set and error was shown
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid email address'));
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
    });

    it('should allow unsetting email when user is not logged in', async () => {
      // Mock logged out state
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(null);
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

      // Verify email was shown
      expect(logger.info).toHaveBeenCalledWith('test@example.com');
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

      // Verify message was shown
      expect(logger.info).toHaveBeenCalledWith('No email set.');
    });
  });
});
