import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cacheModule from '../../src/cache';
import cliState from '../../src/cliState';
import logger from '../../src/logger';
import {
  getExecFileInputs,
  getFileHashes,
  parseScriptParts,
  ScriptCompletionProvider,
} from '../../src/providers/scriptCompletion';
import { mockProcessEnv } from '../util/utils';
import type { MockedFunction } from 'vitest';

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

function normalizeFsPath(path: fs.PathOrFileDescriptor): string {
  if (path instanceof URL) {
    return path.pathname;
  }

  return String(path);
}

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

  it.each([
    // Plain commands tokenize as before
    ['node script.js', ['node', 'script.js']],
    [
      'python3 inference.py --model gpt-4 -v',
      ['python3', 'inference.py', '--model', 'gpt-4', '-v'],
    ],
    ['./run.sh --k=v', ['./run.sh', '--k=v']],
    // Whitespace
    ['node  a.js \t b\n c', ['node', 'a.js', 'b', 'c']],
    ['   node a.js   ', ['node', 'a.js']],
    ['', []],
    ['   ', []],
    // Quotes in the middle of a token join the token
    ['node a.js --name="John Smith"', ['node', 'a.js', '--name=John Smith']],
    ['node a.js --x=\'a b\' --y="c d"', ['node', 'a.js', '--x=a b', '--y=c d']],
    ['a"b c"d', ['ab cd']],
    ['"a b"\'c d\'', ['a bc d']],
    // Empty quotes are empty arguments
    ['node a.js "" b', ['node', 'a.js', '', 'b']],
    ["node a.js '' b", ['node', 'a.js', '', 'b']],
    ['node a.js --empty=""', ['node', 'a.js', '--empty=']],
    ["node a.js --empty=''", ['node', 'a.js', '--empty=']],
    ['node a.js ""', ['node', 'a.js', '']],
    // The other quote style is literal inside quotes
    ['"it\'s"', ["it's"]],
    ['\'say "hi"\'', ['say "hi"']],
    // Backslashes are always literal, so Windows paths work, even before a closing quote
    ['C:\\Users\\x\\script.py arg', ['C:\\Users\\x\\script.py', 'arg']],
    ['.\\script.js arg', ['.\\script.js', 'arg']],
    [
      '"C:\\Program Files\\node\\node.exe" "C:\\Users\\x y\\s.js"',
      ['C:\\Program Files\\node\\node.exe', 'C:\\Users\\x y\\s.js'],
    ],
    ["'C:\\Users\\x y\\s.js' a", ['C:\\Users\\x y\\s.js', 'a']],
    ['"\\\\server\\share\\run.bat" a', ['\\\\server\\share\\run.bat', 'a']],
    ['node a.js --out="C:\\out dir\\" next', ['node', 'a.js', '--out=C:\\out dir\\', 'next']],
    ['"C:\\dir\\" "D:\\x y\\"', ['C:\\dir\\', 'D:\\x y\\']],
    // A quote with no closing match is a literal character and does not swallow later arguments
    ["node a.js --name=O'Brien --verbose", ['node', 'a.js', "--name=O'Brien", '--verbose']],
    ['node a.js "b c', ['node', 'a.js', '"b', 'c']],
    ['node a.js "', ['node', 'a.js', '"']],
    ['node a.js "a b" "c', ['node', 'a.js', 'a b', '"c']],
  ])('parses %j', (input, expected) => {
    expect(parseScriptParts(input)).toEqual(expected);
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
      return normalizeFsPath(path) !== 'nonexistent.js';
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
      const normalizedPath = normalizeFsPath(path);
      if (normalizedPath === 'file1.js') {
        return mockFileContent1;
      }
      if (normalizedPath === 'file2.js') {
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

  it('passes file defaults to the child without changing the host environment', async () => {
    const restore = mockProcessEnv({ PROMPTFOO_REVIEW_ENV_PROBE: 'host' });
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, options, callback) {
      const env = (options as { env?: NodeJS.ProcessEnv }).env;
      (callback as (error: Error | null, stdout: string, stderr: string) => void)(
        null,
        env?.PROMPTFOO_REVIEW_ENV_PROBE ?? 'missing',
        '',
      );
      return { stdin: { end: vi.fn() } } as any;
    });
    try {
      const result = await cliState.withEnvFileOverrides(
        { PROMPTFOO_REVIEW_ENV_PROBE: 'file' },
        () => provider.callApi('hello'),
      );
      expect(result.output).toBe('file');
      expect(process.env.PROMPTFOO_REVIEW_ENV_PROBE).toBe('host');
    } finally {
      restore();
    }
  });

  it('should close stdin on the child process to prevent hanging', async () => {
    const stdinEnd = vi.fn();
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      (callback as (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void)(
        null,
        Buffer.from('ok'),
        '',
      );
      return { stdin: { end: stdinEnd } } as any;
    });

    await provider.callApi('test prompt');
    expect(stdinEnd).toHaveBeenCalledOnce();
  });

  it('should handle child process with no stdin gracefully', async () => {
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      (callback as (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void)(
        null,
        Buffer.from('ok'),
        '',
      );
      return { stdin: null } as any;
    });

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe('ok');
  });

  it('should close stdin before the exec callback rejects on script execution errors', async () => {
    const stdinEnd = vi.fn();
    const errorMessage = 'Script execution failed';
    let stdinClosedBeforeCallback = false;
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      const childProcess = { stdin: { end: stdinEnd } } as any;
      queueMicrotask(() => {
        stdinClosedBeforeCallback = stdinEnd.mock.calls.length > 0;
        if (typeof callback === 'function') {
          callback(new Error(errorMessage), '', '');
        }
      });
      return childProcess;
    });

    await expect(provider.callApi('test prompt')).rejects.toThrow(errorMessage);
    expect(stdinEnd).toHaveBeenCalledOnce();
    expect(stdinClosedBeforeCallback).toBe(true);
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
    const cachedResult = { output: 'cached result' };
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

    const mockHashUpdate = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('mock hash'),
    } as unknown as crypto.Hash;
    vi.mocked(crypto.createHash).mockImplementation(function () {
      return mockHashUpdate;
    });

    const result = await provider.callApi('test prompt');
    expect(result.cached).toBe(true);
    expect(result).toEqual({ ...cachedResult, cached: true });
    expect(mockCache.get).toHaveBeenCalledWith(
      'exec:argv-v2:node script.js:mock hash:mock hash:test prompt:undefined',
    );
    expect(execFile).not.toHaveBeenCalled();
  });

  it('should not reuse output cached under the unversioned key', async () => {
    const staleKey = 'exec:node script.js:mock hash:mock hash:test prompt:undefined';
    const mockCache = {
      get: vi.fn(async (key: string) =>
        key === staleKey ? JSON.stringify({ output: 'stale output' }) : undefined,
      ),
      set: vi.fn(),
    };
    vi.spyOn(cacheModule, 'getCache').mockResolvedValue(mockCache as never);
    vi.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);

    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ isFile: () => true } as fs.Stats);
    readFileSyncMock.mockReturnValue('file content');
    const mockHashUpdate = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('mock hash'),
    } as unknown as crypto.Hash;
    vi.mocked(crypto.createHash).mockImplementation(function () {
      return mockHashUpdate;
    });
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      (callback as (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void)(
        null,
        Buffer.from('fresh output'),
        '',
      );
      return {} as any;
    });

    const result = await provider.callApi('test prompt');

    expect(result.output).toBe('fresh output');
    expect(result.cached).toBeUndefined();
    expect(execFile).toHaveBeenCalledOnce();
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

  it('passes quoted arguments to the script as single arguments', async () => {
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      (callback as (error: Error | null, stdout: string, stderr: string) => void)(null, 'ok', '');
      return {} as any;
    });
    const quotedProvider = new ScriptCompletionProvider(
      `node args.js --name="John Smith" "" --x='a b' --empty=""`,
    );

    await quotedProvider.callApi('test prompt');

    expect(vi.mocked(execFile).mock.calls[0].slice(0, 2)).toEqual([
      'node',
      [
        'args.js',
        '--name=John Smith',
        '',
        '--x=a b',
        '--empty=',
        'test prompt',
        expect.any(String),
        expect.any(String),
      ],
    ]);
  });

  describe('with a real child process', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-exec-args-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('delivers shell-style quoted arguments to the script intact', async () => {
      const actual = await vi.importActual<typeof import('child_process')>('child_process');
      vi.mocked(execFile).mockImplementation(actual.execFile as typeof execFile);
      const scriptFile = path.join(tempDir, 'args.js');
      // The last three arguments are always prompt, options and context
      fs.writeFileSync(scriptFile, 'console.log(JSON.stringify(process.argv.slice(2, -3)));');
      const quotedProvider = new ScriptCompletionProvider(
        `node "${scriptFile}" --name="John Smith" "" --x='a b' --empty="" plain`,
      );

      const result = await quotedProvider.callApi('test prompt');

      expect(JSON.parse(result.output as string)).toEqual([
        '--name=John Smith',
        '',
        '--x=a b',
        '--empty=',
        'plain',
      ]);
    });
  });
});

describe('files attached to arguments', () => {
  let tempDir: string;
  let realExistsSync: typeof fs.existsSync;
  let realStatSync: typeof fs.statSync;
  let realReadFileSync: typeof fs.readFileSync;
  let realCreateHash: typeof crypto.createHash;

  const sha256 = (content: string) => crypto.createHash('sha256').update(content).digest('hex');

  beforeEach(async () => {
    vi.clearAllMocks();
    const actualFs = await vi.importActual<typeof import('fs')>('fs');
    const actualCrypto = await vi.importActual<typeof import('crypto')>('crypto');
    realExistsSync = actualFs.existsSync;
    realStatSync = actualFs.statSync;
    realReadFileSync = actualFs.readFileSync;
    realCreateHash = actualCrypto.createHash;
    // Use the real file system and hashing for these tests
    vi.mocked(fs.existsSync).mockImplementation(realExistsSync);
    vi.mocked(fs.statSync).mockImplementation(realStatSync as never);
    vi.mocked(fs.readFileSync).mockImplementation(realReadFileSync as never);
    vi.mocked(crypto.createHash).mockImplementation(realCreateHash);
    tempDir = actualFs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-exec-attached-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.statSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
    vi.mocked(crypto.createHash).mockReset();
  });

  function writeFile(name: string, content: string): string {
    const filePath = path.join(tempDir, name);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it.each([
    ['double quotes', 'config file.json', '--config="%s"'],
    ['single quotes', 'config file.json', "--config='%s'"],
    ['double quotes without spaces', 'config.json', '--config="%s"'],
    ['no quotes', 'config.json', '--config=%s'],
    ['a short flag', 'config.json', '-c=%s'],
    ['a bare key', 'config.json', 'config=%s'],
  ])('hashes a file attached with =, %s', (_label, fileName, template) => {
    const script = writeFile('script.js', 'script');
    const filePath = writeFile(fileName, 'config v1');
    const parts = parseScriptParts(`node "${script}" ${template.replace('%s', filePath)}`);

    expect(getFileHashes(parts)).toEqual([sha256('script'), sha256('config v1')]);
  });

  it('hashes the part itself and the attached file independently', () => {
    const script = writeFile('script.js', 'script');
    const config = writeFile('config file.json', 'config');
    const parts = parseScriptParts(`node "${script}" --config="${config}"`);

    expect(getFileHashes(parts)).toEqual([sha256('script'), sha256('config')]);
  });

  it('ignores an attached value that is not an existing file', () => {
    const script = writeFile('script.js', 'script');
    fs.mkdirSync(path.join(tempDir, 'a dir'));
    const parts = parseScriptParts(
      `node "${script}" --config="${path.join(tempDir, 'missing file.json')}" --dir="${path.join(tempDir, 'a dir')}" --name="John Smith" --empty= --trailing=`,
    );

    expect(getFileHashes(parts)).toEqual([sha256('script')]);
  });

  it('hashes a file whose own name contains = once', () => {
    const script = writeFile('script.js', 'script');
    const filePath = writeFile('a=b.json', 'literal name');
    // The whole part is a file, so the text after the first = is not hashed as well
    writeFile('b.json', 'would be a duplicate');

    expect(getFileHashes([filePath])).toEqual([sha256('literal name')]);
    expect(getFileHashes([script, `--config=${filePath}`])).toEqual([
      sha256('script'),
      sha256('literal name'),
    ]);
  });

  it('hashes the value after the first = only', () => {
    const script = writeFile('script.js', 'script');
    const filePath = writeFile('x=y.json', 'nested');

    expect(getFileHashes([script, `--opt=${filePath}`])).toEqual([
      sha256('script'),
      sha256('nested'),
    ]);
    expect(getFileHashes([script, `--opt=other=${filePath}`])).toEqual([sha256('script')]);
  });

  it('changes the exec cache key when a file attached to a quoted argument changes', async () => {
    const script = writeFile('script.js', 'script');
    const config = writeFile('config file.json', 'config v1');
    const keys: string[] = [];
    const mockCache = {
      get: vi.fn(async (key: string) => {
        keys.push(key);
        return undefined;
      }),
      set: vi.fn(),
    };
    vi.spyOn(cacheModule, 'getCache').mockResolvedValue(mockCache as never);
    vi.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      (callback as (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void)(
        null,
        Buffer.from('output'),
        '',
      );
      return {} as any;
    });
    const provider = new ScriptCompletionProvider(`node "${script}" --config="${config}"`);

    await provider.callApi('prompt');
    fs.writeFileSync(config, 'config v2');
    await provider.callApi('prompt');

    expect(keys).toHaveLength(2);
    expect(keys[0]).toContain(`:${sha256('script')}:${sha256('config v1')}:`);
    expect(keys[1]).toContain(`:${sha256('script')}:${sha256('config v2')}:`);
    expect(keys[0]).not.toBe(keys[1]);
  });
  it('does not hash a file attached to an argument when no part is itself a file', () => {
    const config = writeFile('config.json', 'config');

    expect(getExecFileInputs(['tool', `--config=${config}`])).toEqual({
      fileHashes: [],
      hasSecretFile: false,
    });
    expect(
      getExecFileInputs(['tool', `--config=${config}`, `--other=${config}`]).fileHashes,
    ).toEqual([]);
  });

  it('does not cache a command found on PATH whose only file is an attached argument', async () => {
    const config = writeFile('config.json', 'config');
    const mockCache = { get: vi.fn(), set: vi.fn() };
    vi.spyOn(cacheModule, 'getCache').mockResolvedValue(mockCache as never);
    vi.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);
    vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
      (callback as (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void)(
        null,
        Buffer.from('output'),
        '',
      );
      return {} as any;
    });
    const provider = new ScriptCompletionProvider(`tool --config="${config}"`);

    await provider.callApi('prompt', { vars: { user: 'a' }, prompt: { raw: 'p', label: 'p' } });
    await provider.callApi('prompt', { vars: { user: 'b' }, prompt: { raw: 'p', label: 'p' } });

    // The child receives the context, which is not part of the cache key, so it must run each time
    expect(vi.mocked(execFile)).toHaveBeenCalledTimes(2);
    expect(mockCache.get).not.toHaveBeenCalled();
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  describe('relative files and the child working directory', () => {
    let hostDir: string;
    let baseDir: string;
    let originalCwd: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      hostDir = path.join(tempDir, 'host');
      baseDir = path.join(tempDir, 'base');
      fs.mkdirSync(hostDir);
      fs.mkdirSync(baseDir);
      process.chdir(hostDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('hashes a relative attached file in the given cwd, not in ours', () => {
      fs.writeFileSync(path.join(hostDir, 'config.json'), 'host copy');
      fs.writeFileSync(path.join(baseDir, 'config.json'), 'base copy');
      const script = writeFile('script.js', 'script');

      expect(getFileHashes([script, '--config=config.json'])).toEqual([
        sha256('script'),
        sha256('host copy'),
      ]);
      expect(getFileHashes([script, '--config=config.json'], baseDir)).toEqual([
        sha256('script'),
        sha256('base copy'),
      ]);
    });

    it('does not hash a copy that exists only in our cwd', () => {
      fs.writeFileSync(path.join(hostDir, 'config.json'), 'host copy');

      expect(getFileHashes(['--config=config.json'], baseDir)).toEqual([]);
      expect(getFileHashes(['config.json'], baseDir)).toEqual([]);
    });

    it('resolves a relative script part against the cwd as well', () => {
      fs.writeFileSync(path.join(hostDir, 'script.py'), 'host script');
      fs.writeFileSync(path.join(baseDir, 'script.py'), 'base script');

      expect(getFileHashes(['python', 'script.py'], baseDir)).toEqual([sha256('base script')]);
    });

    it('keeps absolute paths independent of the cwd', () => {
      const script = writeFile('script.js', 'script');
      const config = writeFile('config.json', 'absolute');

      expect(getFileHashes([script, `--config=${config}`], baseDir)).toEqual([
        sha256('script'),
        sha256('absolute'),
      ]);
    });

    it('keys the exec cache by the file in basePath, not the one in our cwd', async () => {
      fs.writeFileSync(path.join(hostDir, 'config.json'), 'host copy');
      fs.writeFileSync(path.join(baseDir, 'config.json'), 'base v1');
      fs.writeFileSync(path.join(baseDir, 'script.py'), 'script');
      const keys: string[] = [];
      const mockCache = {
        get: vi.fn(async (key: string) => {
          keys.push(key);
          return undefined;
        }),
        set: vi.fn(),
      };
      vi.spyOn(cacheModule, 'getCache').mockResolvedValue(mockCache as never);
      vi.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);
      vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
        (
          callback as (
            error: Error | null,
            stdout: string | Buffer,
            stderr: string | Buffer,
          ) => void
        )(null, Buffer.from('output'), '');
        return {} as any;
      });
      const provider = new ScriptCompletionProvider('python script.py --config=config.json', {
        config: { basePath: baseDir },
      });

      await provider.callApi('prompt');
      fs.writeFileSync(path.join(baseDir, 'config.json'), 'base v2');
      await provider.callApi('prompt');

      expect(vi.mocked(execFile).mock.calls[0][2]).toMatchObject({ cwd: baseDir });
      expect(keys).toHaveLength(2);
      expect(keys[0]).toContain(`:${sha256('script')}:${sha256('base v1')}:`);
      expect(keys[1]).toContain(`:${sha256('script')}:${sha256('base v2')}:`);
      expect(keys.join()).not.toContain(sha256('host copy'));
    });

    it('does not enable caching from a file that exists only in our cwd', async () => {
      fs.writeFileSync(path.join(hostDir, 'config.json'), 'host copy');
      const mockCache = { get: vi.fn(), set: vi.fn() };
      vi.spyOn(cacheModule, 'getCache').mockResolvedValue(mockCache as never);
      vi.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);
      vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
        (
          callback as (
            error: Error | null,
            stdout: string | Buffer,
            stderr: string | Buffer,
          ) => void
        )(null, Buffer.from('output'), '');
        return {} as any;
      });
      const provider = new ScriptCompletionProvider('python --config=config.json', {
        config: { basePath: baseDir },
      });

      await provider.callApi('prompt');

      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('credential files', () => {
    it.each([
      '--token-file',
      '--api-key-file',
      '--api_key_file',
      '--apiKey',
      '--apikey',
      '--password',
      '--passwd',
      '--pwd',
      '--passphrase-file',
      '--credentials',
      '--client-secret-file',
      '--private-key',
      '--privatekey',
      '--ssh-key',
      '--key',
      '--cert',
      '--auth',
      '--Auth-Token',
      '--authorization-file',
      'token',
      'API_KEY',
    ])('never hashes a file attached to %s', (option) => {
      const secret = writeFile('secret.txt', 'hunter2');
      const script = writeFile('script.js', 'script');

      expect(getExecFileInputs([script, `${option}=${secret}`])).toEqual({
        fileHashes: [],
        hasSecretFile: true,
      });
      expect(getFileHashes([script, `${option}=${secret}`])).toEqual([]);
    });

    it('never hashes a file that follows a credential option as a separate argument', () => {
      const secret = writeFile('secret.txt', 'hunter2');
      const script = writeFile('script.js', 'script');

      expect(getExecFileInputs([script, '--token-file', secret]).hasSecretFile).toBe(true);
      expect(getFileHashes([script, '--token-file', secret])).toEqual([]);
    });

    it('still hashes a file that follows a non-credential option', () => {
      const config = writeFile('config.json', 'config');

      expect(getFileHashes(['--config', config])).toEqual([sha256('config')]);
    });

    it('does not flag a credential option whose value is not a file', () => {
      const script = writeFile('script.js', 'script');

      expect(getExecFileInputs([script, '--token=abc123', '--password=hunter2'])).toEqual({
        fileHashes: [sha256('script')],
        hasSecretFile: false,
      });
    });

    it.each([
      '--config',
      '--author-file',
      '--input',
      '--keyboard-layout',
      '--monkey',
      '--output-dir',
      '-c',
      'config',
    ])('keeps hashing a file attached to %s', (option) => {
      const script = writeFile('script.js', 'script');
      const filePath = writeFile('attached.txt', 'attached');

      expect(getFileHashes([script, `${option}=${filePath}`])).toEqual([
        sha256('script'),
        sha256('attached'),
      ]);
    });

    it('drops every hash from a command that attaches a credential file', () => {
      const script = writeFile('script.js', 'script');
      const config = writeFile('config.json', 'config');
      const secret = writeFile('secret.txt', 'hunter2');

      expect(getExecFileInputs([script, `--config=${config}`, `--token-file=${secret}`])).toEqual({
        fileHashes: [],
        hasSecretFile: true,
      });
    });

    it('does not read, hash or cache a credential file', async () => {
      const script = writeFile('script.js', 'script');
      const secret = writeFile('token.txt', 'hunter2');
      const mockCache = { get: vi.fn(), set: vi.fn() };
      vi.spyOn(cacheModule, 'getCache').mockResolvedValue(mockCache as never);
      vi.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);
      vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
        (
          callback as (
            error: Error | null,
            stdout: string | Buffer,
            stderr: string | Buffer,
          ) => void
        )(null, Buffer.from('output'), '');
        return {} as any;
      });
      const readSpy = vi.mocked(fs.readFileSync);
      const provider = new ScriptCompletionProvider(`node "${script}" --token-file="${secret}"`);

      const result = await provider.callApi('prompt');

      expect(result).toEqual({ output: 'output' });
      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
      expect(readSpy.mock.calls.map(([file]) => String(file))).not.toContain(secret);
    });

    it.each([
      ['--token-file="%s" --password=hunter2'],
      ['--password=hunter2 --token-file %s'],
      ['--api-key=sk-live-abc123 --cert-file=%s'],
    ])('never logs the command when a credential file is attached, %s', async (template) => {
      const script = writeFile('script.js', 'script');
      const secret = writeFile('token.txt', 'file-secret');
      const logged: unknown[][] = [];
      // Default log level is info; debug output (which already names the command) is opt-in
      vi.spyOn(logger, 'debug').mockImplementation((() => logger) as never);
      for (const level of ['error', 'warn', 'info'] as const) {
        vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
          logged.push(args);
          return logger;
        }) as never);
      }
      vi.spyOn(cacheModule, 'getCache').mockResolvedValue({ get: vi.fn(), set: vi.fn() } as never);
      vi.spyOn(cacheModule, 'isCacheEnabled').mockReturnValue(true);
      vi.mocked(execFile).mockImplementation(function (_cmd, _args, _options, callback) {
        (
          callback as (
            error: Error | null,
            stdout: string | Buffer,
            stderr: string | Buffer,
          ) => void
        )(null, Buffer.from('output'), '');
        return {} as any;
      });
      const provider = new ScriptCompletionProvider(
        `node "${script}" ${template.replace('%s', secret)}`,
      );

      await provider.callApi('prompt');

      const warnings = vi.mocked(logger.warn).mock.calls.map(([message]) => String(message));
      expect(warnings.some((message) => message.includes('credential file'))).toBe(true);
      const text = JSON.stringify(logged);
      expect(text).not.toContain('hunter2');
      expect(text).not.toContain('sk-live-abc123');
      expect(text).not.toContain('file-secret');
    });
  });
});
