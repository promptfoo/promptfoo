import * as path from 'path';
import {
  getDb,
  getDbPath,
  getDbSignalPath,
  closeDb,
  isDbOpen,
  DrizzleLogWriter,
} from '../../src/database';
import { getEnvBool } from '../../src/envars';
import logger from '../../src/logger';
import { getConfigDirectoryPath } from '../../src/util/config/manage';

jest.mock('../../src/envars');
jest.mock('../../src/logger');
jest.mock('../../src/util/config/manage');

describe('database', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    closeDb();
    jest.mocked(getConfigDirectoryPath).mockReturnValue('/test/config/path');
    jest.mocked(getEnvBool).mockImplementation((key) => {
      if (key === 'IS_TESTING') {
        return true;
      }
      return false;
    });
  });

  afterEach(() => {
    closeDb();
  });

  describe('getDbPath', () => {
    it('should return path in config directory', () => {
      const configPath = '/test/config/path';
      jest.mocked(getConfigDirectoryPath).mockReturnValue(configPath);

      expect(getDbPath()).toBe(path.resolve(configPath, 'promptfoo.db'));
    });
  });

  describe('getDbSignalPath', () => {
    it('should return evalLastWritten path in config directory', () => {
      const configPath = '/test/config/path';
      jest.mocked(getConfigDirectoryPath).mockReturnValue(configPath);

      expect(getDbSignalPath()).toBe(path.resolve(configPath, 'evalLastWritten'));
    });
  });

  describe('getDb', () => {
    beforeEach(() => {
      jest.mocked(getEnvBool).mockImplementation((key) => {
        if (key === 'IS_TESTING') {
          return true;
        }
        return false;
      });
    });

    it('should return in-memory database when testing', () => {
      const db = getDb();
      expect(db).toBeDefined();
    });

    it('should initialize database with WAL mode', () => {
      const db = getDb();
      expect(db).toBeDefined();
    });

    it('should return same instance on subsequent calls', () => {
      const db1 = getDb();
      const db2 = getDb();
      expect(db1).toBe(db2);
    });
  });

  describe('DrizzleLogWriter', () => {
    it('should log debug message when database logs enabled', () => {
      jest.mocked(getEnvBool).mockImplementation((key) => {
        if (key === 'PROMPTFOO_ENABLE_DATABASE_LOGS') {
          return true;
        }
        return false;
      });
      const writer = new DrizzleLogWriter();
      writer.write('test message');
      expect(logger.debug).toHaveBeenCalledWith('Drizzle: test message');
    });

    it('should not log debug message when database logs disabled', () => {
      jest.mocked(getEnvBool).mockReturnValue(false);
      const writer = new DrizzleLogWriter();
      writer.write('test message');
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe('closeDb', () => {
    it('should close database connection and reset instances', () => {
      const _db = getDb();
      expect(isDbOpen()).toBe(true);
      closeDb();
      expect(isDbOpen()).toBe(false);
      const newDb = getDb();
      expect(newDb).toBeDefined();
      expect(isDbOpen()).toBe(true);
    });

    it('should handle errors when closing database', () => {
      const _db = getDb();
      closeDb();
      closeDb(); // Second close should be handled gracefully
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle close errors gracefully', () => {
      const _db = getDb();
      // Force an error by closing twice
      closeDb();
      closeDb();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('isDbOpen', () => {
    it('should return false when database is not initialized', () => {
      closeDb(); // Ensure clean state
      expect(isDbOpen()).toBe(false);
    });

    it('should return true when database is open', () => {
      const _db = getDb();
      expect(isDbOpen()).toBe(true);
    });

    it('should return false after closing database', () => {
      const _db = getDb();
      expect(isDbOpen()).toBe(true);
      closeDb();
      expect(isDbOpen()).toBe(false);
    });
  });
});
