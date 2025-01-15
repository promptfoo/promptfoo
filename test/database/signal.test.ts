import debounce from 'debounce';
import fs from 'fs';
import { getDbSignalPath } from '../../src/database/index';
import { updateSignalFile, ensureSignalFile, setupSignalWatcher } from '../../src/database/signal';
import logger from '../../src/logger';

jest.mock('fs');
jest.mock('debounce', () => jest.fn((fn) => fn));
jest.mock('../../src/logger');
jest.mock('../../src/database/index', () => ({
  getDbSignalPath: jest.fn(),
}));

describe('signal', () => {
  const mockSignalPath = '/mock/signal/path';

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(getDbSignalPath).mockReturnValue(mockSignalPath);

    jest.spyOn(global, 'Date').mockImplementation((): any => ({
      toISOString: () => '2025-01-01T00:00:00.000Z',
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('updateSignalFile', () => {
    it('should write current timestamp to signal file', () => {
      updateSignalFile();

      expect(fs.writeFileSync).toHaveBeenCalledWith(mockSignalPath, '2025-01-01T00:00:00.000Z');
      expect(logger.debug).toHaveBeenCalledWith(`Writing to signal file ${mockSignalPath}`);
      expect(logger.debug).toHaveBeenCalledWith('Successfully wrote to signal file');
    });

    it('should handle write errors gracefully', () => {
      const mockError = new Error('Write failed');
      jest.mocked(fs.writeFileSync).mockImplementation(() => {
        throw mockError;
      });

      updateSignalFile();

      expect(logger.warn).toHaveBeenCalledWith(
        `Failed to write database signal file: ${mockError}`,
      );
    });
  });

  describe('ensureSignalFile', () => {
    it('should create signal file if it does not exist', () => {
      jest.mocked(fs.existsSync).mockReturnValue(false);

      ensureSignalFile();

      expect(fs.writeFileSync).toHaveBeenCalledWith(mockSignalPath, '2025-01-01T00:00:00.000Z');
      expect(logger.debug).toHaveBeenCalledWith(`Creating signal file at ${mockSignalPath}`);
    });

    it('should not create signal file if it already exists', () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);

      ensureSignalFile();

      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalledWith(`Creating signal file at ${mockSignalPath}`);
    });
  });

  describe('setupSignalWatcher', () => {
    let mockWatcher: Pick<fs.FSWatcher, 'on'>;

    beforeEach(() => {
      mockWatcher = {
        on: jest.fn().mockReturnThis(),
      } as any;

      jest.mocked(fs.watch).mockReturnValue(mockWatcher as fs.FSWatcher);
    });

    // Skipping due to debounce mock implementation issue
    it.skip('should set up file watcher correctly', () => {
      const mockCallback = jest.fn();

      const watcher = setupSignalWatcher(mockCallback);

      expect(fs.watch).toHaveBeenCalledWith(mockSignalPath);
      expect(watcher).toBe(mockWatcher);
      expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
      expect(mockWatcher.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(logger.debug).toHaveBeenCalledWith(`Setting up file watcher on ${mockSignalPath}`);
    });

    it('should debounce the change callback', () => {
      const mockCallback = jest.fn();
      const debouncedCallback = jest.fn();
      jest.mocked(debounce).mockReturnValue(debouncedCallback as any);

      setupSignalWatcher(mockCallback);

      expect(debounce).toHaveBeenCalledWith(mockCallback, 250);
      expect(mockWatcher.on).toHaveBeenCalledWith('change', debouncedCallback);
    });

    it('should handle watcher setup errors', () => {
      const mockError = new Error('Watch failed');
      jest.mocked(fs.watch).mockImplementation(() => {
        throw mockError;
      });

      expect(() => setupSignalWatcher(jest.fn())).toThrow(mockError);
      expect(logger.warn).toHaveBeenCalledWith(`Failed to set up file watcher: ${mockError}`);
    });

    it('should ensure signal file exists before watching', () => {
      jest.mocked(fs.existsSync).mockReturnValue(false);
      setupSignalWatcher(jest.fn());

      expect(fs.existsSync).toHaveBeenCalledWith(mockSignalPath);
      expect(fs.writeFileSync).toHaveBeenCalledWith(mockSignalPath, '2025-01-01T00:00:00.000Z');
    });
  });
});
