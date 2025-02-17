import { exec } from 'child_process';
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

    // Mock path resolution to ensure consistent paths
    mockResolve.mockImplementation((p: string) => {
      console.log('mockResolve called with:', p);
      if (!p) {
        console.warn('mockResolve called with undefined path');
        return '/absolute/path/undefined';
      }
      if (typeof p === 'string' && p.includes('script.go')) {
        return '/absolute/path/to/script.go';
      }
      return p;
    });

    // Mock path.dirname to handle path traversal
    const mockDirname = jest.mocked(path.dirname);
    mockDirname.mockImplementation((p: string) => {
      console.log('mockDirname called with:', p);
      if (p === '/absolute/path/to/script.go') {
        return '/absolute/path/to';
      }
      if (p === '/absolute/path/to') {
        return '/absolute/path';
      }
      if (p === '/absolute/path') {
        return '/absolute';
      }
      if (p === '/absolute') {
        return '/';
      }
      return p;
    });

    // Mock path.join to handle path joining
    const mockJoin = jest.mocked(path.join);
    mockJoin.mockImplementation((...paths: string[]) => {
      console.log('mockJoin called with:', paths);
      const validPaths = paths.filter((p) => p !== undefined);
      if (validPaths.length === 2 && validPaths[1] === 'go.mod') {
        const dir = validPaths[0];
        if (dir === '/absolute/path/to') {
          return '/absolute/path/to/go.mod';
        }
      }
      return validPaths.join('/').replace(/\/+/g, '/');
    });

    mockMkdtempSync.mockReturnValue('/tmp/golang-provider-xyz');

    // Mock file existence checks
    mockExistsSync.mockImplementation((p: fs.PathLike) => {
      const path = p.toString();
      console.log('mockExistsSync called with:', path);
      // Mock go.mod file existence in the /absolute/path/to directory
      if (path === '/absolute/path/to/go.mod') {
        console.log('Found go.mod at:', path);
        return true;
      }
      return true; // Default behavior for other files
    });

    mockReaddirSync.mockReturnValue([
      { name: 'test.go', isDirectory: () => false },
    ] as unknown as fs.Dirent[]);

    // Mock exec behavior
    mockExec.mockImplementation(((cmd: string, callback: any) => {
      if (!callback) {
        return {} as any;
      }

      process.nextTick(() => {
        if (cmd.includes('cd') && cmd.includes('go build')) {
          callback(null, { stdout: '', stderr: '' }, '');
        } else if (cmd.includes('golang_wrapper')) {
          callback(null, { stdout: '{"output":"test output"}', stderr: '' }, '');
        } else {
          callback(new Error('test error'), { stdout: '', stderr: '' }, '');
        }
      });
      return {} as any;
    }) as any);
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      const provider = new GolangProvider('script.go', {
        id: 'testId',
        config: { basePath: '/absolute/path/to' },
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
      const provider = new GolangProvider('script.go', {
        config: { basePath: '/absolute/path/to' },
      });
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
      const provider = new GolangProvider('script.go', {
        config: { basePath: '/absolute/path/to' },
      });
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

  describe('API methods', () => {
    it('should call callEmbeddingApi successfully', async () => {
      const provider = new GolangProvider('script.go', {
        config: { basePath: '/absolute/path/to' },
      });
      mockExec.mockImplementation(((cmd: string, callback: any) => {
        if (!callback) {
          return {} as any;
        }
        process.nextTick(() => {
          if (cmd.includes('golang_wrapper')) {
            callback(null, { stdout: '{"embedding":[0.1,0.2,0.3]}', stderr: '' }, '');
          } else {
            callback(null, { stdout: '', stderr: '' }, '');
          }
        });
        return {} as any;
      }) as any);

      const result = await provider.callEmbeddingApi('test prompt');
      expect(result).toEqual({ embedding: [0.1, 0.2, 0.3] });
    });

    it('should call callClassificationApi successfully', async () => {
      const provider = new GolangProvider('script.go', {
        config: { basePath: '/absolute/path/to' },
      });
      mockExec.mockImplementation(((cmd: string, callback: any) => {
        if (!callback) {
          return {} as any;
        }
        process.nextTick(() => {
          if (cmd.includes('golang_wrapper')) {
            callback(null, { stdout: '{"classification":"test_class"}', stderr: '' }, '');
          } else {
            callback(null, { stdout: '', stderr: '' }, '');
          }
        });
        return {} as any;
      }) as any);

      const result = await provider.callClassificationApi('test prompt');
      expect(result).toEqual({ classification: 'test_class' });
    });

    it('should handle stderr output without failing', async () => {
      const provider = new GolangProvider('script.go', {
        config: { basePath: '/absolute/path/to' },
      });
      mockExec.mockImplementation(((cmd: string, callback: any) => {
        if (!callback) {
          return {} as any;
        }
        process.nextTick(() => {
          if (cmd.includes('golang_wrapper')) {
            callback(null, { stdout: '{"output":"test"}', stderr: 'warning: some go warning' }, '');
          } else {
            callback(null, { stdout: '', stderr: '' }, '');
          }
        });
        return {} as any;
      }) as any);

      const result = await provider.callApi('test prompt');
      expect(result).toEqual({ output: 'test' });
    });
  });

  describe('findModuleRoot', () => {
    it('should throw error when go.mod is not found', async () => {
      mockExistsSync.mockImplementation((p: fs.PathLike) => false);
      const provider = new GolangProvider('script.go', {
        config: { basePath: '/absolute/path/to' },
      });

      await expect(provider.callApi('test prompt')).rejects.toThrow(
        'Could not find go.mod file in any parent directory',
      );
    });

    it('should find go.mod in parent directory', async () => {
      // Track all paths checked for debugging
      const checkedPaths: string[] = [];

      mockExistsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        checkedPaths.push(pathStr);

        // Match any path that ends with /absolute/path/to/go.mod
        const isMatch = pathStr.endsWith('/absolute/path/to/go.mod');
        console.log(`Checking path: ${pathStr}, isMatch: ${isMatch}`);
        return isMatch;
      });

      // Mock path.dirname to properly handle path traversal
      const mockDirname = jest.mocked(path.dirname);
      mockDirname.mockImplementation((p: string) => {
        console.log(`dirname called with: ${p}`);
        const parts = p.split('/');
        parts.pop();
        return parts.join('/');
      });

      // Mock path.resolve to handle absolute paths
      const mockResolve = jest.mocked(path.resolve);
      mockResolve.mockImplementation((p: string) => {
        console.log(`resolve called with: ${p}`);
        if (p.startsWith('/')) {
          return p;
        }
        return `/absolute/path/to/${p}`;
      });

      // Mock path.join to properly join paths
      const mockJoin = jest.mocked(path.join);
      mockJoin.mockImplementation((...paths: string[]) => {
        console.log(`join called with:`, paths);
        return paths.join('/').replace(/\/+/g, '/');
      });

      const provider = new GolangProvider('script.go', {
        config: { basePath: '/absolute/path/to/subdir' },
      });

      mockExec.mockImplementation(((cmd: string, callback: any) => {
        if (!callback) {
          return {} as any;
        }
        process.nextTick(() => {
          callback(null, { stdout: '{"output":"test"}', stderr: '' }, '');
        });
        return {} as any;
      }) as any);

      const result = await provider.callApi('test prompt');

      // Add debugging information
      console.log('Paths checked:', checkedPaths);

      expect(result).toEqual({ output: 'test' });

      // Verify that the correct paths were checked
      expect(checkedPaths).toContain('/absolute/path/to/go.mod');
      expect(mockExistsSync).toHaveBeenCalledWith(
        expect.stringContaining('/absolute/path/to/go.mod'),
      );
    });
  });

  describe('script execution', () => {
    it('should handle JSON parsing errors', async () => {
      const provider = new GolangProvider('script.go', {
        config: { basePath: '/absolute/path/to' },
      });
      mockExec.mockImplementation(((cmd: string, callback: any) => {
        if (!callback) {
          return {} as any;
        }
        process.nextTick(() => {
          if (cmd.includes('golang_wrapper')) {
            callback(null, { stdout: 'invalid json', stderr: '' }, '');
          } else {
            callback(null, { stdout: '', stderr: '' }, '');
          }
        });
        return {} as any;
      }) as any);

      await expect(provider.callApi('test prompt')).rejects.toThrow('Error running Golang script');
    });

    it('should use custom function name when specified', async () => {
      const mockParsePathOrGlob = jest.requireMock('../../src/util').parsePathOrGlob;
      mockParsePathOrGlob.mockReturnValueOnce({
        filePath: '/absolute/path/to/script.go',
        functionName: 'custom_function',
        isPathPattern: false,
        extension: 'go',
      });

      const provider = new GolangProvider('script.go:custom_function', {
        config: { basePath: '/absolute/path/to' },
      });

      let executedCommand = '';
      mockExec.mockImplementation(((cmd: string, callback: any) => {
        if (!callback) {
          return {} as any;
        }
        if (cmd.includes('golang_wrapper')) {
          executedCommand = cmd;
        }
        process.nextTick(() => {
          callback(null, { stdout: '{"output":"test"}', stderr: '' }, '');
        });
        return {} as any;
      }) as any);

      await provider.callApi('test prompt');
      expect(executedCommand).toContain('custom_function');
      expect(executedCommand.split(' ')[2]).toBe('custom_function');
    });

    it('should use custom go executable when specified', async () => {
      const provider = new GolangProvider('script.go', {
        config: {
          basePath: '/absolute/path/to',
          goExecutable: '/custom/go',
        },
      });

      let buildCommand = '';
      mockExec.mockImplementation(((cmd: string, callback: any) => {
        if (!callback) {
          return {} as any;
        }
        if (cmd.includes('go build')) {
          buildCommand = cmd;
        }
        process.nextTick(() => {
          callback(null, { stdout: '{"output":"test"}', stderr: '' }, '');
        });
        return {} as any;
      }) as any);

      await provider.callApi('test prompt');
      expect(buildCommand).toContain('/custom/go build');
    });
  });
});
