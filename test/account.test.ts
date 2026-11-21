import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthor, getUserEmail } from '../src/globalConfig/accounts';
import { readGlobalConfig } from '../src/globalConfig/globalConfig';

vi.mock('../src/globalConfig/globalConfig', () => ({
  readGlobalConfig: vi.fn(),
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
