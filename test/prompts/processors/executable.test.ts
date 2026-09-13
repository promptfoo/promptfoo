import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { generateIdFromPrompt } from '../../../src/models/prompt';
import { processExecutableFile } from '../../../src/prompts/processors/executable';
import {
  applyPromptSelection,
  createPromptSelection,
  getPromptsForReplay,
} from '../../../src/util/eval/replay';

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
    vi.mocked(isCacheEnabled).mockReturnValue(false);
    vi.unstubAllEnvs();
  });

  const describeUnix = process.platform === 'win32' ? describe.skip : describe;

  // Cross-platform tests
  it('passes each isolated env file to its executable prompt', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-prompt-env-'));
    const script = path.join(dir, 'prompt.cjs');
    fs.writeFileSync(script, 'process.stdout.write(process.env.PROMPTFOO_REVIEW_ENV_PROBE || "");');
    vi.stubEnv('PROMPTFOO_REVIEW_ENV_PROBE', 'host');
    try {
      const [prompt] = await processExecutableFile(
        `${JSON.stringify(process.execPath)} ${JSON.stringify(script)}`,
        {},
      );
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
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['file', 'suite'])(
    'does not reuse cached prompts across scoped %s environments',
    async (layer) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-prompt-cache-env-'));
      const script = path.join(dir, 'prompt.cjs');
      fs.writeFileSync(
        script,
        'process.stdout.write(process.env.PROMPTFOO_REVIEW_ENV_PROBE || "");',
      );
      const cache = { get: vi.fn().mockResolvedValue('wrong-tenant'), set: vi.fn() };
      vi.mocked(getCache).mockReturnValue(cache as never);
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      try {
        const [prompt] = await processExecutableFile(
          `${JSON.stringify(process.execPath)} ${JSON.stringify(script)}`,
          {},
        );
        for (const value of ['first', 'second', 'first']) {
          const run = () => prompt.function!({ vars: {}, provider: mockProvider });
          const env = { PROMPTFOO_REVIEW_ENV_PROBE: value };
          const output = await (layer === 'file'
            ? cliState.withEnvFileOverrides(env, run)
            : cliState.withEnv(env, run));
          expect(output).toBe(value);
        }
        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it('fingerprints the executable selected by an isolated file PATH', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-prompt-env-path-'));
    const tool = process.platform === 'win32' ? 'fixture-tool.exe' : 'fixture-tool';
    try {
      const prompts: Awaited<ReturnType<typeof processExecutableFile>>[] = [];
      for (const name of ['first', 'second']) {
        const executableDir = path.join(dir, name);
        fs.mkdirSync(executableDir);
        fs.writeFileSync(path.join(executableDir, tool), name, { mode: 0o755 });
        prompts.push(
          await cliState.withEnvFileOverrides({ PATH: executableDir }, () =>
            processExecutableFile(tool, {}),
          ),
        );
      }
      expect(() => applyPromptSelection(prompts[1], createPromptSelection(prompts[0]))).toThrow(
        'no longer exists',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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

  it.each(['binary', 'large script', 'command argument'])(
    'rejects replay after changing a %s implementation',
    async (kind) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-prompt-provenance-'));
      const implementation = path.join(dir, 'prompt-file');
      const contents =
        kind === 'binary' ? '\0original-binary' : '# original script\n' + ' '.repeat(110_000);
      fs.writeFileSync(implementation, contents);
      const command =
        kind === 'command argument'
          ? `${JSON.stringify(process.execPath)} ${JSON.stringify(implementation)}`
          : implementation;
      const original = await processExecutableFile(command, { label: 'Executable prompt' });
      const selection = createPromptSelection(original);
      const unchanged = await processExecutableFile(command, { label: 'Executable prompt' });
      expect(applyPromptSelection(unchanged, selection)).toEqual(unchanged);
      const persisted = JSON.parse(
        JSON.stringify({ ...original[0], id: generateIdFromPrompt(original[0]) }),
      );
      expect(getPromptsForReplay([persisted], unchanged)[0].function).toBe(unchanged[0].function);
      fs.writeFileSync(implementation, contents.replace('original', 'modified'));
      const modified = await processExecutableFile(command, { label: 'Executable prompt' });
      expect(modified[0].raw).toBe(original[0].raw);
      expect(() => applyPromptSelection(modified, selection)).toThrow('no longer exists');
      fs.rmSync(dir, { recursive: true, force: true });
    },
  );

  it.each(['PATH', 'basePath'])(
    'fingerprints executable files resolved through %s',
    async (resolution) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-prompt-resolution-'));
      const name = process.platform === 'win32' ? 'fixture-tool.exe' : 'fixture-tool';
      const file = path.join(dir, name);
      fs.writeFileSync(file, 'original implementation', { mode: 0o755 });
      if (resolution === 'PATH') {
        vi.stubEnv('PATH', dir);
      }
      const command = resolution === 'PATH' ? name : `./${name}`;
      const config = { basePath: dir };
      const original = await processExecutableFile(command, { config });
      const selection = createPromptSelection(original);
      expect(() => applyPromptSelection(original, selection)).not.toThrow();
      const unchanged = await processExecutableFile(command, { config });
      expect(() => applyPromptSelection(unchanged, selection)).not.toThrow();
      fs.writeFileSync(file, 'modified implementation');
      const changed = await processExecutableFile(command, { config });
      expect(changed[0].raw).toBe(original[0].raw);
      expect(() => applyPromptSelection(changed, selection)).toThrow('no longer exists');
      const persisted = JSON.parse(
        JSON.stringify({ ...original[0], id: generateIdFromPrompt(original[0]) }),
      );
      expect(() => getPromptsForReplay([persisted], changed)).toThrow('implementation changed');
      fs.rmSync(dir, { recursive: true, force: true });
    },
  );

  it('rejects replay when executable provenance cannot be read', async () => {
    const command = '/missing/prompt-executable';
    const original = await processExecutableFile(command, {});
    const resolved = await processExecutableFile(command, {});
    expect(() => applyPromptSelection(resolved, createPromptSelection(original))).toThrow(
      'no longer exists',
    );
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
