import fs from 'fs/promises';

import confirm from '@inquirer/confirm';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as init from '../../src/commands/init';
import logger from '../../src/logger';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { createMockResponse } from '../util/utils';

vi.mock('../../src/redteam/commands/init', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    redteamInit: vi.fn(),
  };
});

vi.mock('../../src/server/server', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    startServer: vi.fn(),

    BrowserBehavior: {
      ASK: 0,
      OPEN: 1,
      SKIP: 2,
      OPEN_TO_REPORT: 3,
      OPEN_TO_REDTEAM_CREATE: 4,
    },
  };
});

vi.mock('../../src/util/fetch/index', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithProxy: vi.fn(),
  };
});

vi.mock('fs/promises');
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('path', async () => ({
  ...(await vi.importActual('path')),
  resolve: vi.fn(),
}));
vi.mock('../../src/constants');
vi.mock('../../src/onboarding');
vi.mock('../../src/telemetry');
vi.mock('@inquirer/confirm');
vi.mock('@inquirer/input');
vi.mock('@inquirer/select');

const mockFetchWithProxy = vi.mocked(fetchWithProxy);

describe('init command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithProxy.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('downloadFile', () => {
    it('should download a file successfully', async () => {
      const mockResponse = createMockResponse({
        ok: true,
        status: 200,
        text: () => Promise.resolve('file content'),
      });
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      await init.downloadFile('https://example.com/file.txt', '/path/to/file.txt');

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://example.com/file.txt');
      expect(fs.writeFile).toHaveBeenCalledWith('/path/to/file.txt', 'file content');
    });

    it('should throw an error if download fails', async () => {
      const mockResponse = createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      await expect(
        init.downloadFile('https://example.com/file.txt', '/path/to/file.txt'),
      ).rejects.toThrow('Failed to download file: Not Found');
    });

    it('should handle network errors', async () => {
      mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

      await expect(
        init.downloadFile('https://example.com/file.txt', '/path/to/file.txt'),
      ).rejects.toThrow('Network error');
    });
  });

  describe('downloadDirectory', () => {
    it('should throw an error if fetching directory contents fails on both VERSION and main', async () => {
      const mockResponse = createMockResponse({
        ok: false,
        statusText: 'Not Found',
      });
      mockFetchWithProxy.mockResolvedValueOnce(mockResponse).mockResolvedValueOnce(mockResponse);

      await expect(init.downloadDirectory('example', '/path/to/target')).rejects.toThrow(
        'Failed to fetch directory contents: Not Found',
      );

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      expect(mockFetchWithProxy.mock.calls[0][0]).toContain('?ref=');
      expect(mockFetchWithProxy.mock.calls[1][0]).toContain('?ref=main');
    });

    it('should succeed if VERSION fails but main succeeds', async () => {
      const mockFailedResponse = createMockResponse({
        ok: false,
        statusText: 'Not Found',
      });

      const mockSuccessResponse = createMockResponse({
        ok: true,
        json: () => Promise.resolve([]),
      });

      mockFetchWithProxy
        .mockResolvedValueOnce(mockFailedResponse)
        .mockResolvedValueOnce(mockSuccessResponse);

      await init.downloadDirectory('example', '/path/to/target');

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      expect(mockFetchWithProxy.mock.calls[0][0]).toContain('?ref=');
      expect(mockFetchWithProxy.mock.calls[1][0]).toContain('?ref=main');
    });

    it('should handle network errors', async () => {
      mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

      await expect(init.downloadDirectory('example', '/path/to/target')).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('downloadExample', () => {
    it('should throw an error if directory creation fails', async () => {
      vi.spyOn(fs, 'mkdir').mockRejectedValue(new Error('Permission denied'));

      await expect(init.downloadExample('example', '/path/to/target')).rejects.toThrow(
        'Failed to download example: Permission denied',
      );
    });

    it('should throw an error if downloadDirectory fails', async () => {
      vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);

      // Mock fetch to simulate downloadDirectory failure
      mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

      await expect(init.downloadExample('example', '/path/to/target')).rejects.toThrow(
        'Failed to download example: Network error',
      );
    });
  });

  describe('getExamplesList', () => {
    it('should return a list of examples', async () => {
      const mockResponse = createMockResponse({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { name: 'example1', type: 'dir' },
            { name: 'example2', type: 'dir' },
            { name: 'not-an-example', type: 'file' },
          ]),
      });
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      const examples = await init.getExamplesList();

      expect(examples).toEqual(['example1', 'example2']);
    });

    it('should return an empty array if fetching fails', async () => {
      const mockResponse = createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      const examples = await init.getExamplesList();

      expect(examples).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Not Found'));
    });

    it('should handle network errors', async () => {
      mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

      const examples = await init.getExamplesList();

      expect(examples).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Network error'));
    });
  });

  describe('handleExampleDownload', () => {
    describe('when download fails', () => {
      it('should not show success message when user declines retry', async () => {
        // Download failed
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        // User selects not to download another example
        vi.mocked(confirm).mockResolvedValue(false);

        const loggerSpy = vi.spyOn(logger, 'info');

        const result = await init.handleExampleDownload('.', 'nonexistent-example');

        expect(result).toEqual('nonexistent-example');

        expect(loggerSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('cd nonexistent-example && promptfoo eval'),
        );
      });

      it('should show helpful message when user declines retry', async () => {
        // Download failed
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        // User selects not to download another example
        vi.mocked(confirm).mockResolvedValue(false);

        const loggerSpy = vi.spyOn(logger, 'info');

        const result = await init.handleExampleDownload('.', 'nonexistent-example');

        expect(result).toEqual('nonexistent-example');

        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('No example downloaded'));
      });

      it('should not clean up directory when it existed before', async () => {
        // Download failed
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        // User selects not to download another example
        vi.mocked(confirm).mockResolvedValue(false);

        // Directory exists before download
        vi.spyOn(fs, 'access').mockResolvedValue(undefined);
        // Mock successful cleanup
        const rmSpy = vi.spyOn(fs, 'rm').mockResolvedValue(undefined);

        await init.handleExampleDownload('.', 'nonexistent-example');

        // Should not clean up the directory
        expect(rmSpy).not.toHaveBeenCalledWith('nonexistent-example', {
          recursive: true,
          force: true,
        });
      });

      it('should clean up directory when it did not exist before', async () => {
        // Download failed
        mockFetchWithProxy.mockRejectedValue(new Error('404 Not Found'));
        // User selects not to download another example
        vi.mocked(confirm).mockResolvedValue(false);

        // Directory doesn't exist before download (fs.access throws)
        vi.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT: no such file or directory'));
        // Mock successful cleanup
        const rmSpy = vi.spyOn(fs, 'rm').mockResolvedValue(undefined);

        await init.handleExampleDownload('.', 'nonexistent-example');

        // Should clean up the directory
        expect(rmSpy).toHaveBeenCalledWith('nonexistent-example', { recursive: true, force: true });
      });
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
      expect(initCmd?.options).toHaveLength(2);
    });
  });
});
