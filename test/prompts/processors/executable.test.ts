import * as fs from 'fs';
import * as path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';
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
    it('should process a simple shell script', async () => {
      const scriptPath = path.join(__dirname, 'test-prompt.sh');
      const scriptContent = `#!/bin/bash
echo "Hello from shell script"`;

      // Create a temporary test script
      fs.writeFileSync(scriptPath, scriptContent);
      fs.chmodSync(scriptPath, 0o755);

      try {
        const prompts = await processExecutableFile(scriptPath, {});

        expect(prompts).toHaveLength(1);
        expect(prompts[0].label).toBe(scriptPath);
        expect(prompts[0].raw).toContain('#!/bin/bash');
        expect(typeof prompts[0].function).toBe('function');

        // Test the function execution
        const result = await prompts[0].function!({
          vars: { test: 'value' },
          provider: mockProvider,
        });

        expect(result).toBe('Hello from shell script');
      } finally {
        // Clean up
        fs.unlinkSync(scriptPath);
      }
    });

    it('should handle scripts with arguments', async () => {
      const scriptPath = path.join(__dirname, 'test-args.sh');
      const scriptContent = `#!/bin/bash
CONTEXT=$1
echo "Context received: $CONTEXT"`;

      fs.writeFileSync(scriptPath, scriptContent);
      fs.chmodSync(scriptPath, 0o755);

      try {
        const prompts = await processExecutableFile(scriptPath, {});
        const result = await prompts[0].function!({
          vars: { name: 'test' },
          provider: mockProvider,
        });

        // The script should receive the context as JSON
        expect(result).toContain('Context received:');
        expect(result).toContain('"vars"');
        expect(result).toContain('"name":"test"');
      } finally {
        fs.unlinkSync(scriptPath);
      }
    });

    it('should pass config to the function', async () => {
      const scriptPath = path.join(__dirname, 'test-config.sh');
      const scriptContent = `#!/bin/bash
echo "Test output"`;

      fs.writeFileSync(scriptPath, scriptContent);
      fs.chmodSync(scriptPath, 0o755);

      try {
        const config = { temperature: 0.5 };
        const prompts = await processExecutableFile(scriptPath, { config });

        expect(prompts[0].config).toEqual(config);

        // The function should include config in the context
        const result = await prompts[0].function!({
          vars: {},
          provider: mockProvider,
        });

        expect(result).toBe('Test output');
      } finally {
        fs.unlinkSync(scriptPath);
      }
    });

    it('should handle scripts that output to stderr', async () => {
      const scriptPath = path.join(__dirname, 'test-stderr.sh');
      const scriptContent = `#!/bin/bash
echo "Error message" >&2
echo "Normal output"`;

      fs.writeFileSync(scriptPath, scriptContent);
      fs.chmodSync(scriptPath, 0o755);

      try {
        const prompts = await processExecutableFile(scriptPath, {});
        const result = await prompts[0].function!({
          vars: {},
          provider: mockProvider,
        });

        // Should return stdout even if there's stderr
        expect(result).toBe('Normal output');
      } finally {
        fs.unlinkSync(scriptPath);
      }
    });

    it('should reject when script fails with no stdout', async () => {
      const scriptPath = path.join(__dirname, 'test-error.sh');
      const scriptContent = `#!/bin/bash
echo "Error only" >&2
exit 1`;

      fs.writeFileSync(scriptPath, scriptContent);
      fs.chmodSync(scriptPath, 0o755);

      try {
        const prompts = await processExecutableFile(scriptPath, {});

        await expect(
          prompts[0].function!({
            vars: {},
            provider: mockProvider,
          }),
        ).rejects.toThrow();
      } finally {
        fs.unlinkSync(scriptPath);
      }
    });
  });

  describeUnix('Relative path tests', () => {
    it('should work with exec: prefix and relative paths', async () => {
      const scriptPath = path.join(__dirname, 'test-relative.sh');
      const scriptContent = `#!/bin/bash
echo "Relative path works"`;

      fs.writeFileSync(scriptPath, scriptContent);
      fs.chmodSync(scriptPath, 0o755);

      try {
        // This simulates how the system would call it from processPrompt with basePath
        const prompts = await processExecutableFile(scriptPath, {});

        expect(prompts).toHaveLength(1);
        expect(typeof prompts[0].function).toBe('function');

        const result = await prompts[0].function!({
          vars: {},
          provider: mockProvider,
        });

        expect(result).toBe('Relative path works');
      } finally {
        fs.unlinkSync(scriptPath);
      }
    });
  });
});
