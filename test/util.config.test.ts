import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getConfigDirectoryPath, setConfigDirectoryPath } from '../src/util/config';

jest.mock('os');
jest.mock('fs');

describe('config', () => {
  const mockHomedir = '/mock/home';
  const defaultConfigPath = path.join(mockHomedir, '.promptfoo');

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(os.homedir).mockReturnValue(mockHomedir);
    jest.mocked(fs.existsSync).mockReturnValue(false);
    delete process.env.PROMPTFOO_CONFIG_DIR;
  });

  describe('getConfigDirectoryPath', () => {
    it('returns default path when no custom path is set', () => {
      expect(getConfigDirectoryPath()).toBe(defaultConfigPath);
    });

    it('does not create directory when createIfNotExists is false', () => {
      getConfigDirectoryPath(false);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('creates directory when createIfNotExists is true and directory does not exist', () => {
      getConfigDirectoryPath(true);
      expect(fs.mkdirSync).toHaveBeenCalledWith(defaultConfigPath, { recursive: true });
    });

    it('does not create directory when it already exists', () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      getConfigDirectoryPath(true);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('setConfigDirectoryPath', () => {
    it('updates the config directory path', () => {
      const newPath = '/new/config/path';
      setConfigDirectoryPath(newPath);
      expect(getConfigDirectoryPath()).toBe(newPath);
    });

    it('overrides the environment variable', () => {
      const envPath = '/env/path';
      const newPath = '/new/path';
      process.env.PROMPTFOO_CONFIG_DIR = envPath;
      setConfigDirectoryPath(newPath);
      expect(getConfigDirectoryPath()).toBe(newPath);
    });
  });
});
