import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import * as cacheModule from '../../src/cache';
import {
  parseScriptParts,
  getFileHashes,
  ScriptCompletionProvider,
} from '../../src/providers/scriptCompletion';

jest.mock('fs');
jest.mock('crypto');
jest.mock('child_process');
jest.mock('../../src/cache');

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
    jest.clearAllMocks();
  });

  it('should return file hashes for existing files', () => {
    const scriptParts = ['file1.js', 'file2.js', 'nonexistent.js'];
    const mockFileContent1 = 'content1';
    const mockFileContent2 = 'content2';
    const mockHash1 = 'hash1';
    const mockHash2 = 'hash2';

    jest.mocked(fs.existsSync).mockImplementation((path) => path !== 'nonexistent.js');
    jest.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    } as fs.Stats);
    jest.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path === 'file1.js') {
        return mockFileContent1;
      }
      if (path === 'file2.js') {
        return mockFileContent2;
      }
      throw new Error('File not found');
    });

    const mockHashUpdate = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn(),
    } as unknown as crypto.Hash;
    jest
      .mocked(mockHashUpdate.digest)
      .mockReturnValueOnce(mockHash1)
      .mockReturnValueOnce(mockHash2);
    jest.mocked(crypto.createHash).mockReturnValue(mockHashUpdate);

    const result = getFileHashes(scriptParts);

    expect(result).toEqual([mockHash1, mockHash2]);
    expect(fs.existsSync).toHaveBeenCalledTimes(3);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(crypto.createHash).toHaveBeenCalledTimes(2);
  });

  it('should return an empty array for non-existent files', () => {
    const scriptParts = ['nonexistent1.js', 'nonexistent2.js'];
    jest.mocked(fs.existsSync).mockReturnValue(false);

    const result = getFileHashes(scriptParts);

    expect(result).toEqual([]);
    expect(fs.existsSync).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(crypto.createHash).not.toHaveBeenCalled();
  });
});

describe('ScriptCompletionProvider', () => {
  let provider: ScriptCompletionProvider;

  beforeEach(() => {
    provider = new ScriptCompletionProvider('node script.js');
    jest.clearAllMocks();
    jest.mocked(cacheModule.getCache).mockReset();
    jest.mocked(cacheModule.isCacheEnabled).mockReset();
  });

  it('should return the correct id', () => {
    expect(provider.id()).toBe('exec:node script.js');
  });

  it('should handle UTF-8 characters in script output', async () => {
    const utf8Output = 'Hello, 世界!';
    jest.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
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
    jest.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
      if (typeof callback === 'function') {
        callback(null, '', Buffer.from(utf8Error));
      }
      return {} as any;
    });

    await expect(provider.callApi('test prompt')).rejects.toThrow(utf8Error);
  });

  it('should use cache when available', async () => {
    const cachedResult = { output: 'cached result' };
    const mockCache = {
      get: jest.fn().mockResolvedValue(JSON.stringify(cachedResult)),
      set: jest.fn(),
    };
    jest.spyOn(cacheModule, 'getCache').mockResolvedValue(mockCache as never);
    jest.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);

    // Mock fs.existsSync to return true for at least one file
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as fs.Stats);
    jest.mocked(fs.readFileSync).mockReturnValue('file content');

    const mockHashUpdate = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mock hash'),
    } as unknown as crypto.Hash;
    jest.mocked(crypto.createHash).mockReturnValue(mockHashUpdate);

    const result = await provider.callApi('test prompt');
    expect(result).toEqual(cachedResult);
    expect(mockCache.get).toHaveBeenCalledWith(
      'exec:node script.js:mock hash:mock hash:test prompt:undefined',
    );
    expect(execFile).not.toHaveBeenCalled();
  });

  it('should handle script execution errors', async () => {
    const errorMessage = 'Script execution failed';
    jest.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
      if (typeof callback === 'function') {
        callback(new Error(errorMessage), '', '');
      }
      return {} as any;
    });

    await expect(provider.callApi('test prompt')).rejects.toThrow(errorMessage);
  });

  it('should handle empty standard output with error output', async () => {
    const errorOutput = 'Warning: Something went wrong';
    jest.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
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
    jest.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
      if (typeof callback === 'function') {
        callback(null, Buffer.from(ansiOutput), '');
      }
      return {} as any;
    });

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe(strippedOutput);
  });
});
