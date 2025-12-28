import confirm from '@inquirer/confirm';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configCommand } from '../../src/commands/config';
import { getUserEmail, setUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';

vi.mock('../../src/globalConfig/accounts');
vi.mock('../../src/globalConfig/cloud');
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('@inquirer/confirm');

describe('config command', () => {
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    configCommand(program);
  });

  describe('set email', () => {
    it('should not allow setting email when user is logged in', async () => {
      // Mock logged in state
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return 'test-api-key';
      });

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
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return undefined;
      });

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
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return undefined;
      });

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
    });
  });

  describe('unset email', () => {
    it('should not allow unsetting email when user is logged in', async () => {
      // Mock logged in state
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return 'test-api-key';
      });
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });

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
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return undefined;
      });
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });

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

    it('should handle user confirmation for unsetting email', async () => {
      // Mock logged out state and user confirmation
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return undefined;
      });
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(confirm).mockResolvedValueOnce(true);

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
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return undefined;
      });
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(confirm).mockResolvedValueOnce(false);

      // Execute unset email command without force flag
      const unsetEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'unset')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await unsetEmailCmd?.parseAsync(['node', 'test']);

      // Verify operation was cancelled
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Operation cancelled.');
    });

    it('should handle case when no email is set', async () => {
      // Mock logged out state and no existing email
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return undefined;
      });
      vi.mocked(getUserEmail).mockImplementation(function () {
        return null;
      });

      // Execute unset email command
      const unsetEmailCmd = program.commands
        .find((cmd) => cmd.name() === 'config')
        ?.commands.find((cmd) => cmd.name() === 'unset')
        ?.commands.find((cmd) => cmd.name() === 'email');

      await unsetEmailCmd?.parseAsync(['node', 'test']);

      // Verify appropriate message was shown
      expect(logger.info).toHaveBeenCalledWith('No email is currently set.');
      expect(setUserEmail).not.toHaveBeenCalled();
    });
  });

  describe('get email', () => {
    it('should show email when it exists', async () => {
      // Mock existing email
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });

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
      vi.mocked(getUserEmail).mockImplementation(function () {
        return null;
      });

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
