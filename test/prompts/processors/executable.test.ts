import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cacheModule from '../../../src/cache';
import cliState from '../../../src/cliState';
import { processExecutableFile } from '../../../src/prompts/processors/executable';
import { mockProcessEnv } from '../../util/utils';

import type { ApiProvider } from '../../../src/types/index';

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/cache', () => ({
  getCache: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
  isCacheEnabled: vi.fn(() => false),
}));

describe('processExecutableFile', () => {
  const mockProvider = {
    id: vi.fn(() => 'test-provider'),
    label: 'Test Provider',
    callApi: vi.fn(),
  } as ApiProvider;

  afterEach(() => {
    vi.clearAllMocks();
  });

  const describeUnix = process.platform === 'win32' ? describe.skip : describe;

  // Cross-platform tests
  it('passes scoped env-file values to overlapping executable prompts', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-executable-env-'));
    const scriptPath = path.join(tempDir, 'prompt.cjs');
    const restoreEnv = mockProcessEnv({ PROMPTFOO_REVIEW_ENV_PROBE: 'host' });
    try {
      fs.writeFileSync(scriptPath, 'process.stdout.write(process.env.PROMPTFOO_REVIEW_ENV_PROBE);');
      const [prompt] = await processExecutableFile(`"${process.execPath}" "${scriptPath}"`, {});
      const outputs = await Promise.all(
        ['first', 'second'].map((value) =>
          cliState.withEnvFileOverrides({ PROMPTFOO_REVIEW_ENV_PROBE: value }, () =>
            prompt.function!({ vars: {}, provider: mockProvider }),
          ),
        ),
      );
      expect(outputs).toEqual(['first', 'second']);
      expect(process.env.PROMPTFOO_REVIEW_ENV_PROBE).toBe('host');
    } finally {
      restoreEnv();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('passes shell-style quoted arguments to the script as single arguments', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-executable-args-'));
    const scriptPath = path.join(tempDir, 'prompt.cjs');
    try {
      // The last argument is always the JSON context
      fs.writeFileSync(
        scriptPath,
        'process.stdout.write(JSON.stringify(process.argv.slice(2, -1)));',
      );
      const [prompt] = await processExecutableFile(
        `"${process.execPath}" "${scriptPath}" --name="John Smith" "" --x='a b' --empty=""`,
        {},
      );
      const output = await prompt.function!({ vars: {}, provider: mockProvider });
      expect(JSON.parse(output as string)).toEqual([
        '--name=John Smith',
        '',
        '--x=a b',
        '--empty=',
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keys the cache by parser version so output cached for the old argv is not reused', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-executable-cache-'));
    const scriptPath = path.join(tempDir, 'prompt.cjs');
    const keys: string[] = [];
    const cache = {
      get: vi.fn(async (key: string) => {
        keys.push(key);
        return key.startsWith('exec-prompt:argv-v2:') ? undefined : 'stale output';
      }),
      set: vi.fn(),
    };
    vi.mocked(cacheModule.getCache).mockReturnValue(cache as never);
    vi.mocked(cacheModule.isCacheEnabled).mockReturnValue(true);
    try {
      fs.writeFileSync(scriptPath, "process.stdout.write('fresh output');");
      const [prompt] = await processExecutableFile(`"${process.execPath}" "${scriptPath}"`, {});
      const output = await prompt.function!({ vars: {}, provider: mockProvider });
      expect(output).toBe('fresh output');
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatch(/^exec-prompt:argv-v2:/);
    } finally {
      vi.mocked(cacheModule.getCache).mockImplementation(
        () => ({ get: vi.fn(), set: vi.fn() }) as never,
      );
      vi.mocked(cacheModule.isCacheEnabled).mockReturnValue(false);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('cache key for files attached to quoted arguments', () => {
    const sha256 = (content: string) => crypto.createHash('sha256').update(content).digest('hex');

    async function collectKeys(buildCommand: (configPath: string) => string, configName: string) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-executable-attached-'));
      const scriptPath = path.join(tempDir, 'prompt.cjs');
      const configPath = path.join(tempDir, configName);
      const keys: string[] = [];
      const cache = {
        get: vi.fn(async (key: string) => {
          keys.push(key);
          return undefined;
        }),
        set: vi.fn(),
      };
      vi.mocked(cacheModule.getCache).mockReturnValue(cache as never);
      vi.mocked(cacheModule.isCacheEnabled).mockReturnValue(true);
      try {
        fs.writeFileSync(scriptPath, "process.stdout.write('output');");
        fs.writeFileSync(configPath, 'config v1');
        const [prompt] = await processExecutableFile(
          `"${process.execPath}" "${scriptPath}" ${buildCommand(configPath)}`,
          {},
        );
        await prompt.function!({ vars: {}, provider: mockProvider });
        fs.writeFileSync(configPath, 'config v2');
        await prompt.function!({ vars: {}, provider: mockProvider });
        return { keys, scriptHash: sha256(fs.readFileSync(scriptPath, 'utf8')) };
      } finally {
        vi.mocked(cacheModule.getCache).mockImplementation(
          () => ({ get: vi.fn(), set: vi.fn() }) as never,
        );
        vi.mocked(cacheModule.isCacheEnabled).mockReturnValue(false);
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }

    it.each([
      ['double quotes', 'config file.json', (p: string) => `--config="${p}"`],
      ['single quotes', 'config file.json', (p: string) => `--config='${p}'`],
      ['double quotes without spaces', 'config.json', (p: string) => `--config="${p}"`],
      ['no quotes', 'config.json', (p: string) => `--config=${p}`],
    ])('changes when a file attached with =, %s, changes', async (_label, name, build) => {
      const { keys, scriptHash } = await collectKeys(build, name);

      expect(keys).toHaveLength(2);
      expect(keys[0]).toContain(`:${scriptHash}:${sha256('config v1')}:`);
      expect(keys[1]).toContain(`:${scriptHash}:${sha256('config v2')}:`);
    });

    it('ignores an attached value that is not a file', async () => {
      const { keys, scriptHash } = await collectKeys(
        (p) => `--config="${p}.missing" --name="John Smith"`,
        'config file.json',
      );

      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
      expect(keys[0]).toContain(`:${scriptHash}:{`);
    });

    describe('child working directory and credential files', () => {
      let tempDir: string;
      let hostDir: string;
      let baseDir: string;
      let scriptPath: string;
      let originalCwd: string;
      let keys: string[];
      let cache: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

      beforeEach(() => {
        originalCwd = process.cwd();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-executable-cwd-'));
        hostDir = path.join(tempDir, 'host');
        baseDir = path.join(tempDir, 'base');
        fs.mkdirSync(hostDir);
        fs.mkdirSync(baseDir);
        scriptPath = path.join(tempDir, 'prompt.cjs');
        fs.writeFileSync(scriptPath, "process.stdout.write('output');");
        process.chdir(hostDir);
        keys = [];
        cache = {
          get: vi.fn(async (key: string) => {
            keys.push(key);
            return undefined;
          }),
          set: vi.fn(),
        };
        vi.mocked(cacheModule.getCache).mockReturnValue(cache as never);
        vi.mocked(cacheModule.isCacheEnabled).mockReturnValue(true);
      });

      afterEach(() => {
        process.chdir(originalCwd);
        vi.mocked(cacheModule.getCache).mockImplementation(
          () => ({ get: vi.fn(), set: vi.fn() }) as never,
        );
        vi.mocked(cacheModule.isCacheEnabled).mockReturnValue(false);
        fs.rmSync(tempDir, { recursive: true, force: true });
      });

      it('keys the cache by the attached file in basePath, not the one in our cwd', async () => {
        fs.writeFileSync(path.join(hostDir, 'config.json'), 'host copy');
        fs.writeFileSync(path.join(baseDir, 'config.json'), 'base v1');
        const [prompt] = await processExecutableFile(
          `"${process.execPath}" "${scriptPath}" --config=config.json`,
          { config: { basePath: baseDir } },
        );

        await prompt.function!({ vars: {}, provider: mockProvider });
        fs.writeFileSync(path.join(baseDir, 'config.json'), 'base v2');
        await prompt.function!({ vars: {}, provider: mockProvider });

        const scriptHash = sha256(fs.readFileSync(scriptPath, 'utf8'));
        expect(keys).toHaveLength(2);
        expect(keys[0]).toContain(`:${scriptHash}:${sha256('base v1')}:`);
        expect(keys[1]).toContain(`:${scriptHash}:${sha256('base v2')}:`);
        expect(keys.join()).not.toContain(sha256('host copy'));
      });

      it('does not cache from a file that exists only in our cwd', async () => {
        fs.writeFileSync(path.join(hostDir, 'config.json'), 'host copy');
        const [prompt] = await processExecutableFile(
          `node -e "process.stdout.write('output')" -- --config=config.json`,
          { config: { basePath: baseDir } },
        );

        await prompt.function!({ vars: {}, provider: mockProvider });

        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
      });

      it.each([
        ['--token-file="%s"'],
        ['--api-key-file=%s'],
        ['--password=%s'],
        ['--token-file %s'],
      ])('does not hash or cache a command with a credential file, %s', async (template) => {
        const secretPath = path.join(tempDir, 'secret.txt');
        fs.writeFileSync(secretPath, 'hunter2');
        const [prompt] = await processExecutableFile(
          `"${process.execPath}" "${scriptPath}" ${template.replace('%s', secretPath)}`,
          {},
        );

        const output = await prompt.function!({ vars: {}, provider: mockProvider });

        expect(output).toBe('output');
        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
        expect(keys).toEqual([]);
      });
    });
  });

  it('should process a script with exec: prefix', async () => {
    const scriptPath =
      process.platform === 'win32' ? 'cmd.exe /c echo "test"' : '/usr/bin/echo "test"';
    const prompts = await processExecutableFile(scriptPath, {});

    expect(prompts).toHaveLength(1);
    expect(prompts[0].label).toBe(scriptPath);
    expect(prompts[0].raw).toBe(scriptPath);
    expect(typeof prompts[0].function).toBe('function');
  });

  it('should use custom label when provided', async () => {
    const scriptPath = process.platform === 'win32' ? 'cmd.exe' : '/bin/echo';
    const prompts = await processExecutableFile(scriptPath, { label: 'Custom Label' });

    expect(prompts[0].label).toBe('Custom Label');
  });

  it('should handle binary executables', async () => {
    const scriptPath =
      process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/usr/bin/ls';
    const prompts = await processExecutableFile(scriptPath, {});

    expect(prompts).toHaveLength(1);
    expect(prompts[0].label).toBe(scriptPath);
    // Binary files should not be read as raw content
    expect(prompts[0].raw).toBe(scriptPath);
  });

  it('should handle non-existent files gracefully', async () => {
    const scriptPath = '/non/existent/script.sh';
    const prompts = await processExecutableFile(scriptPath, {});

    expect(prompts).toHaveLength(1);
    expect(prompts[0].label).toBe(scriptPath);
    expect(prompts[0].raw).toBe(scriptPath);
  });

  // Unix-specific tests
  describeUnix('Unix shell script tests', () => {
    let sharedPrompts: Awaited<ReturnType<typeof processExecutableFile>>;
    let tempDir: string;
    let scriptPath: string;

    beforeAll(async () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-executable-test-'));
      scriptPath = path.join(tempDir, 'shared-test-script.sh');
      fs.writeFileSync(
        scriptPath,
        `#!/bin/sh
context="$1"
case "$context" in
  *'"mode":"args"'*)
    printf '%s\\n' "Context received: $context"
    ;;
  *'"mode":"config"'*)
    printf '%s\\n' "Test output"
    ;;
  *'"mode":"stderr"'*)
    printf '%s\\n' "Error message" >&2
    printf '%s\\n' "Normal output"
    ;;
  *'"mode":"error"'*)
    printf '%s\\n' "Error only" >&2
    exit 1
    ;;
  *'"mode":"relative"'*)
    printf '%s\\n' "Relative path works"
    ;;
  *)
    printf '%s\\n' "Hello from shell script"
    ;;
esac
`,
      );
      fs.chmodSync(scriptPath, 0o755);
      sharedPrompts = await processExecutableFile(scriptPath, {});
    });

    afterAll(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should process a simple shell script', async () => {
      expect(sharedPrompts).toHaveLength(1);
      expect(sharedPrompts[0].label).toBe(scriptPath);
      expect(sharedPrompts[0].raw).toContain('#!/bin/sh');
      expect(typeof sharedPrompts[0].function).toBe('function');

      const result = await sharedPrompts[0].function!({
        vars: { test: 'value' },
        provider: mockProvider,
      });

      expect(result).toBe('Hello from shell script');
    });

    it('should handle scripts with arguments', async () => {
      const result = await sharedPrompts[0].function!({
        vars: { mode: 'args', name: 'test' },
        provider: mockProvider,
      });

      // The script should receive the context as JSON
      expect(result).toContain('Context received:');
      expect(result).toContain('"vars"');
      expect(result).toContain('"name":"test"');
    });

    it('should pass config to the function', async () => {
      const config = { temperature: 0.5 };
      const prompts = await processExecutableFile(scriptPath, { config });

      expect(prompts[0].config).toEqual(config);

      const result = await prompts[0].function!({
        vars: { mode: 'config' },
        provider: mockProvider,
      });

      expect(result).toBe('Test output');
    });

    it('should handle scripts that output to stderr', async () => {
      const result = await sharedPrompts[0].function!({
        vars: { mode: 'stderr' },
        provider: mockProvider,
      });

      // Should return stdout even if there's stderr
      expect(result).toBe('Normal output');
    });

    it('should reject when script fails with no stdout', async () => {
      await expect(
        sharedPrompts[0].function!({
          vars: { mode: 'error' },
          provider: mockProvider,
        }),
      ).rejects.toThrow();
    });

    it('should resolve relative paths from prompt.config.basePath', async () => {
      const relativeScriptPath = `.${path.sep}${path.basename(scriptPath)}`;
      const prompts = await processExecutableFile(relativeScriptPath, {
        config: { basePath: tempDir },
      });

      expect(prompts).toHaveLength(1);
      expect(prompts[0].label).toBe(relativeScriptPath);
      expect(typeof prompts[0].function).toBe('function');

      const result = await prompts[0].function!({
        vars: { mode: 'relative' },
        provider: mockProvider,
      });

      expect(result).toBe('Relative path works');
    });
  });
});
