import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { processExecutableFile } from '../../../src/prompts/processors/executable';

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
