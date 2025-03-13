import { getUserEmail, setUserEmail, getAuthor } from '../src/globalConfig/accounts';
import { readGlobalConfig, writeGlobalConfigPartial } from '../src/globalConfig/globalConfig';

jest.mock('../src/globalConfig/globalConfig', () => ({
  writeGlobalConfig: jest.fn(),
  readGlobalConfig: jest.fn(),
  writeGlobalConfigPartial: jest.fn(),
}));

describe('accounts module', () => {
  beforeEach(() => {
    delete process.env.PROMPTFOO_AUTHOR;
    jest.resetModules();
  });

  describe('getUserEmail', () => {
    it('should return the email from global config', () => {
      jest.mocked(readGlobalConfig).mockReturnValue({ account: { email: 'test@example.com' } });
      expect(getUserEmail()).toBe('test@example.com');
    });

    it('should return null if no email is set in global config', () => {
      jest.mocked(readGlobalConfig).mockReturnValue({});
      expect(getUserEmail()).toBeNull();
    });
  });

  describe('setUserEmail', () => {
    it('should write the email to global config', () => {
      const writeGlobalConfigSpy = jest.mocked(writeGlobalConfigPartial);
      setUserEmail('test@example.com');
      expect(writeGlobalConfigSpy).toHaveBeenCalledWith({ account: { email: 'test@example.com' } });
    });
  });

  describe('getAuthor', () => {
    it('should return the author from environment variable', () => {
      process.env.PROMPTFOO_AUTHOR = 'envAuthor';
      expect(getAuthor()).toBe('envAuthor');
    });

    it('should return the email if environment variable is not set', () => {
      jest.mocked(readGlobalConfig).mockReturnValue({ account: { email: 'test@example.com' } });
      expect(getAuthor()).toBe('test@example.com');
    });

    it('should return null if neither environment variable nor email is set', () => {
      jest.mocked(readGlobalConfig).mockReturnValue({});
      expect(getAuthor()).toBeNull();
    });
  });
});
