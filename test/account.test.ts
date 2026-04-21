import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthor, getUserEmail, setUserEmail } from '../src/globalConfig/accounts';
import { readGlobalConfig, writeGlobalConfigPartial } from '../src/globalConfig/globalConfig';

vi.mock('../src/globalConfig/globalConfig', () => ({
  writeGlobalConfig: vi.fn(),
  readGlobalConfig: vi.fn(),
  writeGlobalConfigPartial: vi.fn(),
}));

describe('accounts module', () => {
  beforeEach(() => {
    vi.stubEnv('PROMPTFOO_API_KEY', undefined);
    vi.stubEnv('PROMPTFOO_AUTHOR', undefined);
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(readGlobalConfig).mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  describe('getUserEmail', () => {
    it('should return the email from global config', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });
      expect(getUserEmail()).toBe('test@example.com');
    });

    it('should return null if no email is set in global config', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      expect(getUserEmail()).toBeNull();
    });
  });

  describe('setUserEmail', () => {
    it('should write the email to global config', () => {
      const writeGlobalConfigSpy = vi.mocked(writeGlobalConfigPartial);
      setUserEmail('test@example.com');
      expect(writeGlobalConfigSpy).toHaveBeenCalledWith({ account: { email: 'test@example.com' } });
    });
  });

  describe('getAuthor', () => {
    it('should fall back to PROMPTFOO_AUTHOR env var when no email is set', () => {
      vi.stubEnv('PROMPTFOO_AUTHOR', 'envAuthor');
      vi.mocked(readGlobalConfig).mockReturnValue({ id: 'test-id' });
      expect(getAuthor()).toBe('envAuthor');
    });

    it('should prefer email over PROMPTFOO_AUTHOR env var', () => {
      vi.stubEnv('PROMPTFOO_AUTHOR', 'envAuthor');
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });
      expect(getAuthor()).toBe('test@example.com');
    });

    it('should return the email if environment variable is not set', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        account: { email: 'test@example.com' },
      });
      expect(getAuthor()).toBe('test@example.com');
    });

    it('should return null if neither environment variable nor email is set', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({ id: 'test-id' });
      expect(getAuthor()).toBeNull();
    });
  });
});
