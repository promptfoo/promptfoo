import { exec, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getCache, isCacheEnabled } from '../../src/cache';
import { GolangProvider } from '../../src/providers/golangCompletion';

jest.mock('child_process');
jest.mock('../../src/cache');
jest.mock('fs');
jest.mock('path');

jest.mock('../../src/util', () => {
  const actual = jest.requireActual('../../src/util');
  return {
    ...actual,
    parsePathOrGlob: jest.fn(() => ({
      extension: 'go',
      functionName: undefined,
      isPathPattern: false,
      filePath: '/absolute/path/to/script.go',
    })),
  };
});

describe('GolangProvider', () => {
  const mockExec = jest.mocked(exec);
  const mockGetCache = jest.mocked(getCache);
  const mockIsCacheEnabled = jest.mocked(isCacheEnabled);
  const mockReadFileSync = jest.mocked(fs.readFileSync);
  const mockResolve = jest.mocked(path.resolve);
  const mockMkdtempSync = jest.mocked(fs.mkdtempSync);
  const mockExistsSync = jest.mocked(fs.existsSync);
  const mockRmSync = jest.mocked(fs.rmSync);
  const mockReaddirSync = jest.mocked(fs.readdirSync);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCache.mockResolvedValue({
      get: jest.fn(),
      set: jest.fn(),
    } as never);
    mockIsCacheEnabled.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('mock file content');
    mockResolve.mockImplementation((p: string) => `/absolute/path/${p}`);
    mockMkdtempSync.mockReturnValue('/tmp/golang-provider-xyz');
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      { name: 'test.go', isDirectory: () => false },
    ] as unknown as fs.Dirent[]);
    mockExec.mockImplementation(((cmd: string, callback: any) => {
      if (!callback) {
        return {} as any;
      }

      process.nextTick(() => {
        if (cmd.includes('cd') && cmd.includes('go build')) {
          callback(null, { stdout: '', stderr: '' }, '');
        } else if (cmd.includes('golang_wrapper')) {
          callback(null, { stdout: '{"output":"test output"}', stderr: '' }, '');
        }
      });
      return {} as any;
    }) as any);
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      const provider = new GolangProvider('script.go', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });

    it('should initialize with golang: syntax', () => {
      const provider = new GolangProvider('golang:script.go', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });

    it('should initialize with file:// prefix', () => {
      const provider = new GolangProvider('file://script.go', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });

    it('should initialize with file:// prefix and function name', () => {
      const provider = new GolangProvider('file://script.go:function_name', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });
  });

  describe('caching', () => {
    it('should use cached result when available', async () => {
      const provider = new GolangProvider('script.go');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: jest.fn().mockResolvedValue(JSON.stringify({ output: 'cached result' })),
        set: jest.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockCache.get).toHaveBeenCalledWith(expect.stringContaining('golang:'));
      expect(mockExec).not.toHaveBeenCalled();
      expect(result).toEqual({ output: 'cached result' });
    });
  });

  describe('cleanup', () => {
    it('should clean up on error', async () => {
      const provider = new GolangProvider('script.go');
      mockExec.mockImplementation(((cmd: string, callback: any) => {
        if (!callback) {
          return {} as any;
        }
        process.nextTick(() => {
          callback(new Error('test error'), { stdout: '', stderr: '' }, '');
        });
        return {} as any;
      }) as any);

      await expect(provider.callApi('test prompt')).rejects.toThrow(
        'Error running Golang script: test error',
      );

      expect(mockRmSync).toHaveBeenCalledWith(
        expect.stringContaining('golang-provider'),
        expect.objectContaining({ recursive: true, force: true }),
      );
    });
  });

  describe('build and execution process', () => {
    const mockExecFile = jest.mocked(execFile);

    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
        if (!p) return false;
        if ((p as string).includes('golang_wrapper')) {
          return false;
        }
        return true;
      });
      jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' } as any);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should build the executable if not present and return correct result', async () => {
      const provider = new GolangProvider('script.go', { config: { basePath: '/base' } });
      const result = await provider.callApi('test prompt');

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const buildArgs = mockExecFile.mock.calls[0][1];
      expect(buildArgs).toBeDefined();
      expect(buildArgs[0]).toBe('build');
      expect(buildArgs[1]).toBe('-o');
      expect(buildArgs[2]).toContain('golang_wrapper');

      expect(result).toEqual({ output: 'test output' });
    });

    it('should remove temporary directory after successful run', async () => {
      const provider = new GolangProvider('script.go');
      await provider.callApi('test prompt');
      expect(fs.rmSync).toHaveBeenCalledWith('/tmp/golang-provider-xyz', { recursive: true, force: true });
    });

    it('should construct command with default function name (call_api)', async () => {
      const provider = new GolangProvider('script.go');
      await provider.callApi('test prompt');
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('call_api'));
    });
  });

  describe('API alternative methods', () => {
    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    });
    it('should execute callEmbeddingApi and callClassificationApi correctly', async () => {
      const provider = new GolangProvider('script.go', { config: { basePath: '/base' } });
      const resultEmbedding = await provider.callEmbeddingApi('embedding prompt');
      const resultClassification = await provider.callClassificationApi('classification prompt');
      expect(resultEmbedding).toEqual({ output: 'test output' });
      expect(resultClassification).toEqual({ output: 'test output' });
    });
  });
});
