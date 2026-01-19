import input from '@inquirer/input';
import chalk from 'chalk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvString, isCI } from '../../src/envars';
import {
  checkEmailStatus,
  checkEmailStatusAndMaybeExit,
  clearUserEmail,
  getAuthMethod,
  getAuthor,
  getUserEmail,
  getUserId,
  isLoggedIntoCloud,
  promptForEmailUnverified,
  setUserEmail,
} from '../../src/globalConfig/accounts';
import {
  readGlobalConfig,
  writeGlobalConfig,
  writeGlobalConfigPartial,
} from '../../src/globalConfig/globalConfig';
import logger from '../../src/logger';
import telemetry from '../../src/telemetry';
import { fetchWithTimeout } from '../../src/util/fetch/index';

// Mock fetchWithTimeout before any imports that might use telemetry
vi.mock('../../src/util/fetch', () => ({
  fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@inquirer/input');
vi.mock('../../src/envars');
vi.mock('../../src/telemetry', () => {
  const mockTelemetry = {
    record: vi.fn().mockResolvedValue(undefined),
    identify: vi.fn(),
    saveConsent: vi.fn().mockResolvedValue(undefined),
    disabled: false,
  };
  return {
    default: mockTelemetry,
    Telemetry: vi.fn().mockImplementation(() => mockTelemetry),
  };
});
vi.mock('../../src/util/fetch/index.ts');
vi.mock('../../src/globalConfig/globalConfig');
vi.mock('../../src/util');
vi.mock('../../src/logger');

describe('accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserId', () => {
    it('should return existing ID from global config', () => {
      const existingId = 'existing-test-id';
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: existingId,
        account: { email: 'test@example.com' },
      });

      const result = getUserId();

      expect(result).toBe(existingId);
      expect(writeGlobalConfig).not.toHaveBeenCalled();
    });

    it('should generate new ID and save to config when no ID exists', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
      });

      const result = getUserId();

      // Should return a UUID-like string
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // Should have saved the config with the new ID
      expect(writeGlobalConfig).toHaveBeenCalledWith({
        account: { email: 'test@example.com' },
        id: result,
      });
    });

    it('should generate new ID when global config is null', () => {
      vi.mocked(readGlobalConfig).mockReturnValue(null as any);

      const result = getUserId();

      // Should return a UUID-like string
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // Should have saved the config with the new ID
      expect(writeGlobalConfig).toHaveBeenCalledWith({
        id: result,
      });
    });

    it('should generate new ID when global config is undefined', () => {
      vi.mocked(readGlobalConfig).mockReturnValue(undefined as any);

      const result = getUserId();

      // Should return a UUID-like string
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // Should have saved the config with the new ID
      expect(writeGlobalConfig).toHaveBeenCalledWith({
        id: result,
      });
    });

    it('should generate new ID when config exists but has no id property', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
      });

      const result = getUserId();

      // Should return a UUID-like string
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // Should have saved the config with the new ID
      expect(writeGlobalConfig).toHaveBeenCalledWith({
        account: { email: 'test@example.com' },
        id: result,
      });
    });
  });

  describe('getUserEmail', () => {
    it('should return email from global config', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });
      expect(getUserEmail()).toBe('test@example.com');
    });

    it('should return null if no email in config', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      expect(getUserEmail()).toBeNull();
    });
  });

  describe('setUserEmail', () => {
    it('should write email to global config', () => {
      // Must mock readGlobalConfig to ensure clean state (no leftover account properties from other tests)
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      const email = 'test@example.com';
      setUserEmail(email);
      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({
        account: { email },
      });
    });
  });

  describe('clearUserEmail', () => {
    it('should remove email from global config when email exists', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });
      clearUserEmail();
      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({
        account: {},
      });
    });

    it('should handle clearing when no account exists', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      clearUserEmail();
      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({
        account: {},
      });
    });

    it('should handle clearing when global config is empty', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({});
      clearUserEmail();
      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({
        account: {},
      });
    });
  });

  describe('getAuthor', () => {
    it('should return env var if set', () => {
      vi.mocked(getEnvString).mockReturnValue('author@env.com');
      expect(getAuthor()).toBe('author@env.com');
    });

    it('should fall back to user email if no env var', () => {
      vi.mocked(getEnvString).mockReturnValue('');
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });
      expect(getAuthor()).toBe('test@example.com');
    });

    it('should return null if no author found', () => {
      vi.mocked(getEnvString).mockReturnValue('');
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      expect(getAuthor()).toBeNull();
    });
  });

  describe('promptForEmailUnverified', () => {
    beforeEach(() => {
      vi.mocked(isCI).mockReturnValue(false);
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
    });

    it('should use CI email if in CI environment', async () => {
      vi.mocked(isCI).mockReturnValue(true);
      await promptForEmailUnverified();
      expect(telemetry.saveConsent).not.toHaveBeenCalled();
    });

    it('should not prompt for email if already set', async () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'existing@example.com' },
      });

      await promptForEmailUnverified();

      expect(input).not.toHaveBeenCalled();
      // save consent is now called after validation, not in promptForEmailUnverified
      expect(telemetry.saveConsent).not.toHaveBeenCalled();
    });

    it('should prompt for email and save valid input', async () => {
      vi.mocked(input).mockResolvedValue('new@example.com');

      await promptForEmailUnverified();

      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({
        account: { email: 'new@example.com' },
      });
      // save consent is now called after validation, not in promptForEmailUnverified
      expect(telemetry.saveConsent).not.toHaveBeenCalled();
    });

    describe('email validation', () => {
      let validateFn: (input: string) => Promise<string | boolean>;

      beforeEach(async () => {
        await promptForEmailUnverified();
        validateFn = vi.mocked(input).mock.calls[0][0].validate as (
          input: string,
        ) => Promise<string | boolean>;
      });

      it('should reject invalid email formats with error message', async () => {
        const invalidEmails = [
          '',
          'invalid',
          '@example.com',
          'user@',
          'user@.',
          'user.com',
          'user@.com',
          '@.',
          'user@example.',
          'user.@example.com',
          'us..er@example.com',
        ];

        for (const email of invalidEmails) {
          const result = await validateFn(email);
          expect(typeof result).toBe('string');
          expect(result).toBe('Invalid email address');
        }
      });

      it('should accept valid email formats with true', async () => {
        const validEmails = [
          'valid@example.com',
          'user.name@example.com',
          'user+tag@example.com',
          'user@subdomain.example.com',
          'user@example.co.uk',
          '123@example.com',
          'user-name@example.com',
          'user_name@example.com',
        ];

        for (const email of validEmails) {
          await expect(validateFn(email)).toBe(true);
        }
      });
    });
  });

  describe('checkEmailStatusAndMaybeExit', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should use CI email when in CI environment', async () => {
      vi.mocked(isCI).mockReturnValue(true);

      const mockResponse = new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        statusText: 'OK',
      });
      vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      await checkEmailStatusAndMaybeExit();

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/status?email=ci-placeholder%40promptfoo.dev'),
        undefined,
        500,
      );
    });

    it('should use user email when not in CI environment', async () => {
      vi.mocked(isCI).mockReturnValue(false);
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });

      const mockResponse = new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        statusText: 'OK',
      });
      vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      await checkEmailStatusAndMaybeExit();

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/status?email=test%40example.com'),
        undefined,
        500,
      );
    });

    it('should exit if limit exceeded', async () => {
      vi.mocked(isCI).mockReturnValue(false);
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });

      const mockResponse = new Response(JSON.stringify({ status: 'exceeded_limit' }), {
        status: 200,
        statusText: 'OK',
      });
      vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      await checkEmailStatusAndMaybeExit();

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        'You have exceeded the maximum cloud inference limit. Please contact inquiries@promptfoo.dev to upgrade your account.',
      );
    });

    it('should display warning message when status is show_usage_warning', async () => {
      vi.mocked(isCI).mockReturnValue(false);
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });

      const warningMessage = 'You are approaching your usage limit';
      const mockResponse = new Response(
        JSON.stringify({ status: 'show_usage_warning', message: warningMessage }),
        {
          status: 200,
          statusText: 'OK',
        },
      );
      vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      await checkEmailStatusAndMaybeExit();

      expect(logger.info).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(chalk.yellow(warningMessage));
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('should return bad_email and not exit when status is risky_email or disposable_email', async () => {
      vi.mocked(isCI).mockReturnValue(false);
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });

      const mockResponse = new Response(JSON.stringify({ status: 'risky_email' }), {
        status: 200,
        statusText: 'OK',
      });
      vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      const result = await checkEmailStatusAndMaybeExit();

      expect(result).toBe('bad_email');
      expect(logger.error).toHaveBeenCalledWith('Please use a valid work email.');
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('should handle fetch errors', async () => {
      vi.mocked(isCI).mockReturnValue(false);
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });
      vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('Network error'));

      await checkEmailStatusAndMaybeExit();

      expect(logger.debug).toHaveBeenCalledWith(
        'Failed to check user status: Error: Network error',
      );
      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  describe('checkEmailStatus', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return no_email status when no email is provided', async () => {
      vi.mocked(isCI).mockReturnValue(false);
      vi.mocked(readGlobalConfig).mockReturnValue({});

      const result = await checkEmailStatus();

      expect(result).toEqual({
        status: 'no_email',
        hasEmail: false,
        message: 'Redteam evals require email verification. Please enter your work email:',
      });
    });

    it('should use CI email when in CI environment', async () => {
      vi.mocked(isCI).mockReturnValue(true);

      const mockResponse = new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        statusText: 'OK',
      });
      vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      const result = await checkEmailStatus();

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/status?email=ci-placeholder%40promptfoo.dev'),
        undefined,
        500,
      );
      expect(result).toEqual({
        status: 'ok',
        hasEmail: true,
        email: 'ci-placeholder@promptfoo.dev',
        message: undefined,
      });
    });

    it('should return exceeded_limit status', async () => {
      vi.mocked(isCI).mockReturnValue(false);
      vi.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
      });

      const mockResponse = new Response(JSON.stringify({ status: 'exceeded_limit' }), {
        status: 200,
        statusText: 'OK',
      });
      vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      const result = await checkEmailStatus();

      expect(result).toEqual({
        status: 'exceeded_limit',
        hasEmail: true,
        email: 'test@example.com',
        message: undefined,
      });
    });

    it('should return show_usage_warning status with message', async () => {
      vi.mocked(isCI).mockReturnValue(false);
      vi.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
      });

      const warningMessage = 'You are approaching your usage limit';
      const mockResponse = new Response(
        JSON.stringify({ status: 'show_usage_warning', message: warningMessage }),
        {
          status: 200,
          statusText: 'OK',
        },
      );
      vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      const result = await checkEmailStatus();

      expect(result).toEqual({
        status: 'show_usage_warning',
        hasEmail: true,
        email: 'test@example.com',
        message: warningMessage,
      });
    });

    it('should handle fetch errors gracefully', async () => {
      vi.mocked(isCI).mockReturnValue(false);
      vi.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
      });
      vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('Network error'));

      const result = await checkEmailStatus();

      expect(logger.debug).toHaveBeenCalledWith(
        'Failed to check user status: Error: Network error',
      );
      expect(result).toEqual({
        status: 'ok',
        hasEmail: true,
        email: 'test@example.com',
        message: 'Unable to verify email status, but proceeding',
      });
    });

    describe('with validate option', () => {
      beforeEach(() => {
        vi.mocked(isCI).mockReturnValue(false);
        vi.mocked(readGlobalConfig).mockReturnValue({
          account: { email: 'test@example.com' },
        });
      });

      it('should call saveConsent for valid email when validate is true', async () => {
        const mockResponse = new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          statusText: 'OK',
        });
        vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

        await checkEmailStatus({ validate: true });

        expect(telemetry.saveConsent).toHaveBeenCalledWith('test@example.com', {
          source: 'promptForEmailValidated',
        });
      });

      it('should call saveConsent for invalid email when validate is true', async () => {
        const mockResponse = new Response(JSON.stringify({ status: 'risky_email' }), {
          status: 200,
          statusText: 'OK',
        });
        vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

        await checkEmailStatus({ validate: true });

        expect(telemetry.saveConsent).toHaveBeenCalledWith('test@example.com', {
          source: 'filteredInvalidEmail',
        });
      });

      it('should not call saveConsent when validate is not provided', async () => {
        const mockResponse = new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          statusText: 'OK',
        });
        vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

        await checkEmailStatus();

        expect(telemetry.saveConsent).not.toHaveBeenCalled();
      });
    });
  });

  describe('isLoggedIntoCloud', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return true when API key is present (not in CI)', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        cloud: { apiKey: 'test-api-key' },
      });
      vi.mocked(isCI).mockReturnValue(false);
      expect(isLoggedIntoCloud()).toBe(true);
    });

    it('should return true when API key is present (in CI)', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        cloud: { apiKey: 'test-api-key' },
      });
      vi.mocked(isCI).mockReturnValue(true);
      expect(isLoggedIntoCloud()).toBe(true);
    });

    it('should return false when no API key is present (not in CI)', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        cloud: {},
      });
      vi.mocked(isCI).mockReturnValue(false);
      expect(isLoggedIntoCloud()).toBe(false);
    });

    it('should return false when no API key is present (in CI)', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        cloud: {},
      });
      vi.mocked(isCI).mockReturnValue(true);
      expect(isLoggedIntoCloud()).toBe(false);
    });

    it('should return false when cloud config is missing', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({});
      vi.mocked(isCI).mockReturnValue(false);
      expect(isLoggedIntoCloud()).toBe(false);
    });

    it('should return true with email and API key (backwards compatibility)', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
        cloud: { apiKey: 'test-api-key' },
      });
      vi.mocked(isCI).mockReturnValue(false);
      expect(isLoggedIntoCloud()).toBe(true);
    });

    it('should return false with email but no API key', () => {
      // Having email alone is not sufficient for cloud authentication
      vi.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
        cloud: {},
      });
      vi.mocked(isCI).mockReturnValue(false);
      expect(isLoggedIntoCloud()).toBe(false);
    });
  });

  describe('getAuthMethod', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return "api-key" when API key is present', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        cloud: { apiKey: 'test-api-key' },
      });
      expect(getAuthMethod()).toBe('api-key');
    });

    it('should return "api-key" when both API key and email are present', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
        cloud: { apiKey: 'test-api-key' },
      });
      expect(getAuthMethod()).toBe('api-key');
    });

    it('should return "email" when only email is present (no API key)', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        account: { email: 'test@example.com' },
        cloud: {},
      });
      expect(getAuthMethod()).toBe('email');
    });

    it('should return "none" when neither API key nor email is present', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        cloud: {},
      });
      expect(getAuthMethod()).toBe('none');
    });

    it('should return "none" when cloud config is missing', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({});
      expect(getAuthMethod()).toBe('none');
    });

    it('should return "none" when global config is null', () => {
      vi.mocked(readGlobalConfig).mockReturnValue(null as any);
      expect(getAuthMethod()).toBe('none');
    });
  });
});
