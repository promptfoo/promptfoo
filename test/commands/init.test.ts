import { Command } from 'commander';
import fs from 'fs/promises';
import * as init from '../../src/commands/init';
import logger from '../../src/logger';

// Add mock for redteam init
jest.mock('../../src/redteam/commands/init', () => ({
  redteamInit: jest.fn(),
}));

jest.mock('../../src/server/server', () => ({
  startServer: jest.fn(),
  BrowserBehavior: {
    ASK: 0,
    OPEN: 1,
    SKIP: 2,
    OPEN_TO_REPORT: 3,
    OPEN_TO_REDTEAM_CREATE: 4,
  },
}));

jest.mock('../../src/commands/init', () => {
  const actual = jest.requireActual('../../src/commands/init');
  return {
    ...actual,
    downloadDirectory: jest.fn(actual.downloadDirectory),
    downloadExample: jest.fn(actual.downloadExample),
    getExamplesList: jest.fn(actual.getExamplesList),
  };
});

jest.mock('fs/promises');
jest.mock('path');
jest.mock('../../src/constants');
jest.mock('../../src/onboarding');
jest.mock('../../src/telemetry');
jest.mock('@inquirer/confirm');
jest.mock('@inquirer/input');
jest.mock('@inquirer/select');

const mockFetch = jest.mocked(jest.fn());
global.fetch = mockFetch;

describe('init command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('downloadFile', () => {
    it('should download a file successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('file content'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await init.downloadFile('https://example.com/file.txt', '/path/to/file.txt');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/file.txt');
      expect(fs.writeFile).toHaveBeenCalledWith('/path/to/file.txt', 'file content');
    });

    it('should throw an error if download fails', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        init.downloadFile('https://example.com/file.txt', '/path/to/file.txt'),
      ).rejects.toThrow('Failed to download file: Not Found');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        init.downloadFile('https://example.com/file.txt', '/path/to/file.txt'),
      ).rejects.toThrow('Network error');
    });
  });

  describe('downloadDirectory', () => {
    it('should throw an error if fetching directory contents fails', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Not Found',
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(init.downloadDirectory('example', '/path/to/target')).rejects.toThrow(
        'Failed to fetch directory contents: Not Found',
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(init.downloadDirectory('example', '/path/to/target')).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('downloadExample', () => {
    it('should throw an error if directory creation fails', async () => {
      jest.spyOn(fs, 'mkdir').mockRejectedValue(new Error('Permission denied'));

      await expect(init.downloadExample('example', '/path/to/target')).rejects.toThrow(
        'Failed to download example: Permission denied',
      );
    });

    it('should throw an error if downloadDirectory fails', async () => {
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      jest.mocked(init.downloadDirectory).mockRejectedValue(new Error('Download failed'));

      await expect(init.downloadExample('example', '/path/to/target')).rejects.toThrow(
        'Failed to download example: Network error',
      );
    });
  });

  describe('getExamplesList', () => {
    it('should return a list of examples', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue([
          { name: 'example1', type: 'dir' },
          { name: 'example2', type: 'dir' },
          { name: 'not-an-example', type: 'file' },
        ]),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const examples = await init.getExamplesList();

      expect(examples).toEqual(['example1', 'example2']);
    });

    it('should return an empty array if fetching fails', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };
      mockFetch.mockResolvedValue(mockResponse);

      const examples = await init.getExamplesList();

      expect(examples).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Not Found'));
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const examples = await init.getExamplesList();

      expect(examples).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Network error'));
    });
  });

  describe('initCommand', () => {
    let program: Command;

    beforeEach(() => {
      program = new Command();
      init.initCommand(program);
      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      if (!initCmd) {
        throw new Error('initCmd not found');
      }
    });

    it('should set up the init command correctly', () => {
      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      expect(initCmd).toBeDefined();
      expect(initCmd?.description()).toBe(
        'Initialize project with dummy files or download an example',
      );
      expect(initCmd?.options).toHaveLength(3);
    });
  });
});
