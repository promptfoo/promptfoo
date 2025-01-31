import input from '@inquirer/input';
import { getEnvString, isCI } from '../../src/envars';
import { fetchWithTimeout } from '../../src/fetch';
import {
  getUserEmail,
  setUserEmail,
  getAuthor,
  promptForEmailUnverified,
  checkEmailStatusOrExit,
} from '../../src/globalConfig/accounts';
import { readGlobalConfig, writeGlobalConfigPartial } from '../../src/globalConfig/globalConfig';
import logger from '../../src/logger';
import telemetry from '../../src/telemetry';

jest.mock('@inquirer/input');
jest.mock('../../src/envars');
jest.mock('../../src/fetch');
jest.mock('../../src/telemetry');

describe('accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserEmail', () => {
    it('should return email from global config', () => {
      jest.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
      });
      expect(getUserEmail()).toBe('test@example.com');
    });

    it('should return null if no email in config', () => {
      jest.mocked(readGlobalConfig).mockReturnValue({});
      expect(getUserEmail()).toBeNull();
    });
  });

  describe('setUserEmail', () => {
    it('should write email to global config', () => {
      const email = 'test@example.com';
      setUserEmail(email);
      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({
        account: { email },
      });
    });
  });

  describe('getAuthor', () => {
    it('should return env var if set', () => {
      jest.mocked(getEnvString).mockReturnValue('author@env.com');
      expect(getAuthor()).toBe('author@env.com');
    });

    it('should fall back to user email if no env var', () => {
      jest.mocked(getEnvString).mockReturnValue('');
      jest.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
      });
      expect(getAuthor()).toBe('test@example.com');
    });

    it('should return null if no author found', () => {
      jest.mocked(getEnvString).mockReturnValue('');
      jest.mocked(readGlobalConfig).mockReturnValue({});
      expect(getAuthor()).toBeNull();
    });
  });

  describe('promptForEmailUnverified', () => {
    it('should use CI email if in CI environment', async () => {
      jest.mocked(isCI).mockReturnValue(true);
      await promptForEmailUnverified();
      expect(telemetry.saveConsent).toHaveBeenCalledWith('ci-placeholder@promptfoo.dev', {
        source: 'promptForEmailUnverified',
      });
    });

    it('should prompt for email if not set', async () => {
      jest.mocked(isCI).mockReturnValue(false);
      jest.mocked(readGlobalConfig).mockReturnValue({});
      jest.mocked(input).mockResolvedValue('new@example.com');

      await promptForEmailUnverified();

      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({
        account: { email: 'new@example.com' },
      });
      expect(telemetry.saveConsent).toHaveBeenCalledWith('new@example.com', {
        source: 'promptForEmailUnverified',
      });
    });

    it('should validate email input', async () => {
      jest.mocked(isCI).mockReturnValue(false);
      jest.mocked(readGlobalConfig).mockReturnValue({});
      await promptForEmailUnverified();

      const validateFn = jest.mocked(input).mock.calls[0][0].validate as (
        input: string,
      ) => string | boolean;

      expect(validateFn('')).toBe('Email is required');
      expect(validateFn('invalid')).toBe('Email is required');
      expect(validateFn('valid@example.com')).toBe(true);
    });
  });

  describe('checkEmailStatusOrExit', () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should use CI email when in CI environment', async () => {
      jest.mocked(isCI).mockReturnValue(true);

      const mockResponse = new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        statusText: 'OK',
      });
      jest.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      await checkEmailStatusOrExit();

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        'https://api.promptfoo.app/api/users/status?email=ci-placeholder@promptfoo.dev',
        undefined,
        500,
      );
    });

    it('should use user email when not in CI environment', async () => {
      jest.mocked(isCI).mockReturnValue(false);
      jest.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
      });

      const mockResponse = new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        statusText: 'OK',
      });
      jest.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      await checkEmailStatusOrExit();

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        'https://api.promptfoo.app/api/users/status?email=test@example.com',
        undefined,
        500,
      );
    });

    it('should exit if limit exceeded', async () => {
      jest.mocked(isCI).mockReturnValue(false);
      jest.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
      });

      const mockResponse = new Response(JSON.stringify({ status: 'exceeded_limit' }), {
        status: 200,
        statusText: 'OK',
      });
      jest.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      await checkEmailStatusOrExit();

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        'You have exceeded the maximum cloud inference limit. Please contact inquiries@promptfoo.dev to upgrade your account.',
      );
    });

    it('should handle fetch errors', async () => {
      jest.mocked(isCI).mockReturnValue(false);
      jest.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
      });
      jest.mocked(fetchWithTimeout).mockRejectedValue(new Error('Network error'));

      await checkEmailStatusOrExit();

      expect(logger.debug).toHaveBeenCalledWith(
        'Failed to check user status: Error: Network error',
      );
      expect(mockExit).not.toHaveBeenCalled();
    });
  });
});
