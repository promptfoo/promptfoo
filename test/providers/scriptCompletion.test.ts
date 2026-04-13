import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cacheModule from '../../src/cache';
import logger from '../../src/logger';
import {
  getFileHashes,
  parseScriptParts,
  ScriptCompletionProvider,
} from '../../src/providers/scriptCompletion';
import type { MockedFunction } from 'vitest';

let createActualHash: typeof crypto.createHash;

function realSha256(value: string) {
  return createActualHash('sha256').update(value).digest('hex');
}

vi.mock('child_process', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    execFile: vi.fn(),
  };
});
vi.mock('../../src/cache', async () => {
  const actual = await vi.importActual<typeof import('../../src/cache')>('../../src/cache');
  return {
    ...actual,
    getCache: vi.fn(),
    isCacheEnabled: vi.fn(),
  };
});

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const existsSync = vi.fn();
  const statSync = vi.fn();
  const readFileSync = vi.fn();
  return {
    ...actual,
    existsSync,
    statSync,
    readFileSync,
    default: { ...actual, existsSync, statSync, readFileSync },
  };
});

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  const createHash = vi.fn();
  return {
    ...actual,
    createHash,
    default: { ...actual, createHash },
  };
});

let existsSyncMock: MockedFunction<typeof fs.existsSync>;
let statSyncMock: MockedFunction<typeof fs.statSync>;
let readFileSyncMock: MockedFunction<typeof fs.readFileSync>;
let createHashMock: MockedFunction<typeof crypto.createHash>;

beforeAll(async () => {
  const actualCrypto = await vi.importActual<typeof import('crypto')>('crypto');
  createActualHash = actualCrypto.createHash;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseScriptParts', () => {
  it('should parse script parts correctly', () => {
    const scriptPath = `node script.js "arg with 'spaces'" 'another arg' simple_arg`;
    const result = parseScriptParts(scriptPath);
    expect(result).toEqual(['node', 'script.js', "arg with 'spaces'", 'another arg', 'simple_arg']);
  });

  it('should handle script path with no arguments', () => {
    const scriptPath = '/bin/bash script.sh';
    const result = parseScriptParts(scriptPath);
    expect(result).toEqual(['/bin/bash', 'script.sh']);
  });
});

describe('getFileHashes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock = vi.mocked(fs.existsSync);
    statSyncMock = vi.mocked(fs.statSync);
    readFileSyncMock = vi.mocked(fs.readFileSync);
    createHashMock = vi.mocked(crypto.createHash);
  });

  it('should return file hashes for existing files', () => {
    const scriptParts = ['file1.js', 'file2.js', 'nonexistent.js'];
    const mockFileContent1 = 'content1';
    const mockFileContent2 = 'content2';
    const mockHash1 = 'hash1';
    const mockHash2 = 'hash2';

    existsSyncMock.mockImplementation(function (path: fs.PathLike) {
      return path !== 'nonexistent.js';
    });
    statSyncMock.mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    } as fs.Stats);
    readFileSyncMock.mockImplementation(function (path: fs.PathOrFileDescriptor) {
      if (path === 'file1.js') {
        return mockFileContent1;
      }
      if (path === 'file2.js') {
        return mockFileContent2;
      }
      throw new Error('File not found');
    });

    const mockHashUpdate = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(),
    } as unknown as crypto.Hash;
    vi.mocked(mockHashUpdate.digest)
      .mockImplementationOnce(function () {
        return mockHash1;
      })
      .mockReturnValueOnce(mockHash2);
    createHashMock.mockReturnValue(mockHashUpdate);

    const result = getFileHashes(scriptParts);

    expect(result).toEqual([mockHash1, mockHash2]);
    expect(existsSyncMock).toHaveBeenCalledTimes(3);
    expect(readFileSyncMock).toHaveBeenCalledTimes(2);
    expect(createHashMock).toHaveBeenCalledTimes(2);
  });

  it('should return an empty array for non-existent files', () => {
    const scriptParts = ['nonexistent1.js', 'nonexistent2.js'];
    existsSyncMock.mockReturnValue(false);

    const result = getFileHashes(scriptParts);

    expect(result).toEqual([]);
    expect(existsSyncMock).toHaveBeenCalledTimes(2);
    expect(readFileSyncMock).not.toHaveBeenCalled();
    expect(createHashMock).not.toHaveBeenCalled();
  });
});

describe('ScriptCompletionProvider', () => {
  let provider: ScriptCompletionProvider;

  beforeEach(() => {
    provider = new ScriptCompletionProvider('node script.js');
    vi.clearAllMocks();
    vi.mocked(cacheModule.getCache).mockReset();
    vi.mocked(cacheModule.isCacheEnabled).mockReset();
    existsSyncMock = vi.mocked(fs.existsSync);
    statSyncMock = vi.mocked(fs.statSync);
    readFileSyncMock = vi.mocked(fs.readFileSync);
    createHashMock = vi.mocked(crypto.createHash);

    // Set up default file system mocks for all tests
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    } as fs.Stats);
    readFileSyncMock.mockReturnValue('default file content');

    // Set up default crypto mock
    const mockHashUpdate = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('default-hash'),
    } as unknown as crypto.Hash;
    createHashMock.mockReturnValue(mockHashUpdate);
  });

  it('should return the correct id', () => {
    expect(provider.id()).toBe('exec:node script.js');
  });

  it('should handle UTF-8 characters in script output', async () => {
    const utf8Output = 'Hello, 世界!';
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      (callback as (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void)(
        null,
        Buffer.from(utf8Output),
        '',
      );
      return {} as any;
    });

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe(utf8Output);
  });

  it('should handle UTF-8 characters in error output', async () => {
    const utf8Error = 'エラー発生';
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      if (typeof callback === 'function') {
        callback(null, '', Buffer.from(utf8Error));
      }
      return {} as any;
    });

    await expect(provider.callApi('test prompt')).rejects.toThrow(utf8Error);
  });

  it('should use cache when available', async () => {
    const cachedResult = { output: 'cached sk-test-cached-output-secret result' };
    const options = { config: { basePath: '/base', apiKey: 'sk-test-script-secret' } } as any;
    const provider = new ScriptCompletionProvider('node script.js', options);
    const context = {
      vars: { promptSecret: 'sk-test-context-secret' },
      prompt: { label: 'sk-test-context-label-secret' },
    } as any;
    const mockCache = {
      get: vi.fn().mockResolvedValue(JSON.stringify(cachedResult)),
      set: vi.fn(),
    };
    vi.spyOn(cacheModule, 'getCache').mockResolvedValue(mockCache as never);
    vi.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);

    // Mock fs.existsSync to return true for at least one file
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ isFile: () => true } as fs.Stats);
    readFileSyncMock.mockReturnValue('file content');

    vi.mocked(crypto.createHash).mockImplementation(function () {
      let value = '';
      const mockHash = {
        update: vi.fn((input: string | Buffer) => {
          value += Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
          return mockHash;
        }),
        digest: vi.fn(() => realSha256(value)),
      } as unknown as crypto.Hash;
      return mockHash;
    });

    const result = await provider.callApi('test prompt', context);
    const fileHash = realSha256('file content');
    const expectedCacheKey = `exec:node script.js:${fileHash}:${fileHash}:${realSha256('test prompt')}:${realSha256(
      JSON.stringify(options) ?? 'undefined',
    )}:${realSha256(JSON.stringify(context) ?? 'undefined')}`;

    expect(result.cached).toBe(true);
    expect(result).toEqual({ ...cachedResult, cached: true });
    expect(mockCache.get).toHaveBeenCalledWith(expectedCacheKey);
    expect(expectedCacheKey).not.toContain('test prompt');
    expect(expectedCacheKey).not.toContain('sk-test-script-secret');
    expect(expectedCacheKey).not.toContain('sk-test-context-secret');
    expect(expectedCacheKey).not.toContain('sk-test-context-label-secret');
    const debugLogs = vi.mocked(logger.debug).mock.calls.map((call) => JSON.stringify(call));
    expect(debugLogs.join('\n')).not.toContain('sk-test-cached-output-secret');
    expect(logger.debug).toHaveBeenCalledWith('Returning cached result for script', {
      scriptPath: 'node script.js',
    });
    expect(execFile).not.toHaveBeenCalled();
  });

  it('should hash cache keys when storing fresh results', async () => {
    const options = { config: { basePath: '/base', apiKey: 'sk-test-script-secret' } } as any;
    const provider = new ScriptCompletionProvider('node script.js', options);
    const context = {
      vars: { promptSecret: 'sk-test-context-secret' },
      prompt: { label: 'sk-test-context-label-secret' },
    } as any;
    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };
    vi.spyOn(cacheModule, 'getCache').mockResolvedValue(mockCache as never);
    vi.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);

    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ isFile: () => true } as fs.Stats);
    readFileSyncMock.mockReturnValue('file content');

    vi.mocked(crypto.createHash).mockImplementation(function () {
      let value = '';
      const mockHash = {
        update: vi.fn((input: string | Buffer) => {
          value += Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
          return mockHash;
        }),
        digest: vi.fn(() => realSha256(value)),
      } as unknown as crypto.Hash;
      return mockHash;
    });

    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      if (typeof callback === 'function') {
        callback(null, Buffer.from('fresh result'), '');
      }
      return {} as any;
    });

    const result = await provider.callApi('test prompt', context);
    const fileHash = realSha256('file content');
    const expectedCacheKey = `exec:node script.js:${fileHash}:${fileHash}:${realSha256('test prompt')}:${realSha256(
      JSON.stringify(options) ?? 'undefined',
    )}:${realSha256(JSON.stringify(context) ?? 'undefined')}`;

    expect(result.output).toBe('fresh result');
    expect(mockCache.set).toHaveBeenCalledWith(
      expectedCacheKey,
      JSON.stringify({ output: 'fresh result' }),
    );
    expect(expectedCacheKey).not.toContain('test prompt');
    expect(expectedCacheKey).not.toContain('sk-test-script-secret');
    expect(expectedCacheKey).not.toContain('sk-test-context-secret');
    expect(expectedCacheKey).not.toContain('sk-test-context-label-secret');
  });

  it('produces the same cache key for two runs that differ only by per-run identifiers', async () => {
    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };
    vi.spyOn(cacheModule, 'getCache').mockResolvedValue(mockCache as never);
    vi.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);

    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ isFile: () => true } as fs.Stats);
    readFileSyncMock.mockReturnValue('file content');

    vi.mocked(crypto.createHash).mockImplementation(function () {
      let value = '';
      const mockHash = {
        update: vi.fn((input: string | Buffer) => {
          value += Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
          return mockHash;
        }),
        digest: vi.fn(() => realSha256(value)),
      } as unknown as crypto.Hash;
      return mockHash;
    });

    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      if (typeof callback === 'function') {
        callback(null, Buffer.from('fresh result'), '');
      }
      return {} as any;
    });

    const baseContext = {
      vars: { name: 'Alice' },
      prompt: { raw: 'Hi Alice', label: 'Hi {{name}}' },
      test: { vars: { name: 'Alice' }, assert: [], options: {}, metadata: {} },
      repeatIndex: 0,
    };

    await provider.callApi('test prompt', {
      ...baseContext,
      evaluationId: 'eval-first-run',
      testCaseId: 'case-first',
      traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-aaaaaaaaaaaaaaaa-01',
      tracestate: 'vendor=first',
      testIdx: 0,
      promptIdx: 0,
    } as any);

    await provider.callApi('test prompt', {
      ...baseContext,
      evaluationId: 'eval-second-run',
      testCaseId: 'case-second',
      traceparent: '00-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-bbbbbbbbbbbbbbbb-01',
      tracestate: 'vendor=second',
      testIdx: 3,
      promptIdx: 2,
    } as any);

    const firstCacheKey = mockCache.get.mock.calls[0][0] as string;
    const secondCacheKey = mockCache.get.mock.calls[1][0] as string;

    expect(firstCacheKey).toBe(secondCacheKey);
    // Neither key should embed the per-run identifiers that would break
    // cache hits across eval runs.
    expect(firstCacheKey).not.toContain('eval-first-run');
    expect(secondCacheKey).not.toContain('eval-second-run');
  });

  it('should separate cache keys for different context payloads', async () => {
    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };
    vi.spyOn(cacheModule, 'getCache').mockResolvedValue(mockCache as never);
    vi.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);

    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ isFile: () => true } as fs.Stats);
    readFileSyncMock.mockReturnValue('file content');

    vi.mocked(crypto.createHash).mockImplementation(function () {
      let value = '';
      const mockHash = {
        update: vi.fn((input: string | Buffer) => {
          value += Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
          return mockHash;
        }),
        digest: vi.fn(() => realSha256(value)),
      } as unknown as crypto.Hash;
      return mockHash;
    });

    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      if (typeof callback === 'function') {
        callback(null, Buffer.from('fresh result'), '');
      }
      return {} as any;
    });

    await provider.callApi('test prompt', {
      vars: { tenant: 'SECRET_TENANT' },
      prompt: { label: 'SECRET_LABEL_A' },
    } as any);
    await provider.callApi('test prompt', {
      vars: { tenant: 'SECRET_TENANT' },
      prompt: { label: 'SECRET_LABEL_B' },
    } as any);

    const firstCacheKey = mockCache.get.mock.calls[0][0] as string;
    const secondCacheKey = mockCache.get.mock.calls[1][0] as string;

    expect(firstCacheKey).not.toBe(secondCacheKey);
    expect(firstCacheKey).not.toContain('SECRET_TENANT');
    expect(secondCacheKey).not.toContain('SECRET_TENANT');
    expect(firstCacheKey).not.toContain('SECRET_LABEL_A');
    expect(secondCacheKey).not.toContain('SECRET_LABEL_B');
  });

  it('should handle script execution errors', async () => {
    const errorMessage = 'Script execution failed';
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      if (typeof callback === 'function') {
        callback(new Error(errorMessage), '', '');
      }
      return {} as any;
    });

    await expect(provider.callApi('test prompt')).rejects.toThrow(errorMessage);
  });

  it('should handle empty standard output with error output', async () => {
    const errorOutput = 'Warning: Something went wrong';
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      if (typeof callback === 'function') {
        callback(null, '', Buffer.from(errorOutput));
      }
      return {} as any;
    });

    await expect(provider.callApi('test prompt')).rejects.toThrow(errorOutput);
  });

  it('should strip ANSI escape codes from output', async () => {
    const ansiOutput = '\x1b[31mColored\x1b[0m \x1b[1mBold\x1b[0m';
    const strippedOutput = 'Colored Bold';
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      if (typeof callback === 'function') {
        callback(null, Buffer.from(ansiOutput), '');
      }
      return {} as any;
    });

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe(strippedOutput);
  });
});
