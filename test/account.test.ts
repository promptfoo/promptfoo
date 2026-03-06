import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthor, getUserEmail, setUserEmail } from '../src/globalConfig/accounts';
import { readGlobalConfig, writeGlobalConfigPartial } from '../src/globalConfig/globalConfig';

vi.mock('../src/globalConfig/globalConfig', () => ({
  writeGlobalConfig: vi.fn(),
  readGlobalConfig: vi.fn(),
  writeGlobalConfigPartial: vi.fn(),
}));

const originalPromptfooApiKey = process.env.PROMPTFOO_API_KEY;
const originalPromptfooAuthor = process.env.PROMPTFOO_AUTHOR;

describe('accounts module', () => {
  beforeEach(() => {
    delete process.env.PROMPTFOO_API_KEY;
    delete process.env.PROMPTFOO_AUTHOR;
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(readGlobalConfig).mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
    if (originalPromptfooApiKey === undefined) {
      delete process.env.PROMPTFOO_API_KEY;
    } else {
      process.env.PROMPTFOO_API_KEY = originalPromptfooApiKey;
    }
    if (originalPromptfooAuthor === undefined) {
      delete process.env.PROMPTFOO_AUTHOR;
    } else {
      process.env.PROMPTFOO_AUTHOR = originalPromptfooAuthor;
    }
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
      process.env.PROMPTFOO_AUTHOR = 'envAuthor';
      vi.mocked(readGlobalConfig).mockReturnValue({ id: 'test-id' });
      expect(getAuthor()).toBe('envAuthor');
    });

    it('should prefer email over PROMPTFOO_AUTHOR env var', () => {
      process.env.PROMPTFOO_AUTHOR = 'envAuthor';
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
