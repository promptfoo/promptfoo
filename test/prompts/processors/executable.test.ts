import * as fs from 'fs';
import * as path from 'path';
import { processExecutableFile } from '../../../src/prompts/processors/executable';
import type { ApiProvider } from '../../../src/types';

jest.mock('../../../src/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../../src/cache', () => ({
  getCache: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
  isCacheEnabled: jest.fn(() => false),
}));

describe('processExecutableFile', () => {
  const mockProvider: ApiProvider = {
    id: jest.fn(() => 'test-provider'),
    label: 'Test Provider',
    callApi: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should process a simple shell script', async () => {
    const scriptPath = path.join(__dirname, 'test-prompt.sh');
    const scriptContent = `#!/bin/bash
echo "Hello from shell script"`;

    // Create a temporary test script
    fs.writeFileSync(scriptPath, scriptContent);
    fs.chmodSync(scriptPath, 0o755);

    try {
      const prompts = processExecutableFile(scriptPath, {});

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

  it('should process a script with exec: prefix', () => {
    const scriptPath = '/usr/bin/echo "test"';
    const prompts = processExecutableFile(scriptPath, {});

    expect(prompts).toHaveLength(1);
    expect(prompts[0].label).toBe(scriptPath);
    expect(prompts[0].raw).toBe(scriptPath);
    expect(typeof prompts[0].function).toBe('function');
  });

  it('should handle scripts with arguments', async () => {
    const scriptPath = path.join(__dirname, 'test-args.sh');
    const scriptContent = `#!/bin/bash
CONTEXT=$1
echo "Context received: $CONTEXT"`;

    fs.writeFileSync(scriptPath, scriptContent);
    fs.chmodSync(scriptPath, 0o755);

    try {
      const prompts = processExecutableFile(scriptPath, {});
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

  it('should use custom label when provided', () => {
    const scriptPath = '/bin/echo';
    const prompts = processExecutableFile(scriptPath, { label: 'Custom Label' });

    expect(prompts[0].label).toBe('Custom Label');
  });

  it('should pass config to the function', async () => {
    const scriptPath = path.join(__dirname, 'test-config.sh');
    const scriptContent = `#!/bin/bash
echo "Test output"`;

    fs.writeFileSync(scriptPath, scriptContent);
    fs.chmodSync(scriptPath, 0o755);

    try {
      const config = { temperature: 0.5 };
      const prompts = processExecutableFile(scriptPath, { config });

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

  it('should handle binary executables', () => {
    const scriptPath = '/usr/bin/ls';
    const prompts = processExecutableFile(scriptPath, {});

    expect(prompts).toHaveLength(1);
    expect(prompts[0].label).toBe(scriptPath);
    // Binary files should not be read as raw content
    expect(prompts[0].raw).toBe(scriptPath);
  });

  it('should handle non-existent files gracefully', () => {
    const scriptPath = '/non/existent/script.sh';
    const prompts = processExecutableFile(scriptPath, {});

    expect(prompts).toHaveLength(1);
    expect(prompts[0].label).toBe(scriptPath);
    expect(prompts[0].raw).toBe(scriptPath);
  });

  it('should handle scripts that output to stderr', async () => {
    const scriptPath = path.join(__dirname, 'test-stderr.sh');
    const scriptContent = `#!/bin/bash
echo "Error message" >&2
echo "Normal output"`;

    fs.writeFileSync(scriptPath, scriptContent);
    fs.chmodSync(scriptPath, 0o755);

    try {
      const prompts = processExecutableFile(scriptPath, {});
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
      const prompts = processExecutableFile(scriptPath, {});

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
