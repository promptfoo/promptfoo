import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import * as pythonUtils from '../../src/python/pythonUtils';

// Windows CI has severe filesystem delays - allow up to 90s
const TEST_TIMEOUT = process.platform === 'win32' ? 90000 : 15000;

// Windows-specific test to verify pipe delimiter handles drive letters correctly
// This test ensures paths like C:\ don't break the protocol parsing
describe('PythonProvider Windows Path Handling', () => {
  let tempDir: string;
  let previousCacheEnabled: string | undefined;
  let pathProvider: PythonProvider;
  let concurrentProvider: PythonProvider;
  let protocolProvider: PythonProvider;
  let specialCharsProvider: PythonProvider;
  const providers: PythonProvider[] = [];

  const createProvider = (scriptName: string, scriptContent: string) => {
    const scriptPath = path.join(tempDir, scriptName);
    fs.writeFileSync(scriptPath, scriptContent);
    const provider = new PythonProvider(scriptPath, {
      id: `python:${scriptName}`,
      config: { basePath: tempDir },
    });
    providers.push(provider);
    return provider;
  };

  beforeAll(async () => {
    // Reset Python state
    pythonUtils.state.cachedPythonPath = null;
    pythonUtils.state.validationPromise = null;

    // Disable caching for tests
    previousCacheEnabled = process.env.PROMPTFOO_CACHE_ENABLED;
    process.env.PROMPTFOO_CACHE_ENABLED = 'false';

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-windows-path-test-'));

    pathProvider = createProvider(
      'path_test.py',
      `
import os

def call_api(prompt, options, context):
    temp_dir = os.environ.get('TEMP', os.environ.get('TMP', '/tmp'))
    return {
        "output": f"Processed: {prompt}",
        "metadata": {
            "temp_path": temp_dir,
            "has_colon": ":" in temp_dir
        }
    }
`,
    );

    concurrentProvider = createProvider(
      'concurrent_test.py',
      `
def call_api(prompt, options, context):
    return {
        "output": f"Processed: {prompt}"
    }
`,
    );

    protocolProvider = createProvider(
      'protocol_test.py',
      `
def call_api(prompt, options, context):
    # If we got here, the protocol parsing worked correctly
    return {
        "output": "Protocol parsing successful",
        "platform": "${process.platform}"
    }
`,
    );

    specialCharsProvider = createProvider(
      'special_chars.py',
      `
def call_api(prompt, options, context):
    import os
    temp_dir = os.environ.get('TEMP', '/tmp')
    return {
        "output": "Success",
        "metadata": {
            "temp_dir": temp_dir,
            "has_special_chars": any(c in temp_dir for c in [' ', '-', '_', '.'])
        }
    }
`,
    );

    await Promise.all(providers.map((provider) => provider.initialize()));
  });

  afterAll(async () => {
    // Cleanup providers
    const shutdownResults = await Promise.allSettled(
      providers.map(async (provider) => ({
        providerId: provider.id(),
        result: await provider.shutdown(),
      })),
    );
    const shutdownFailures = shutdownResults
      .map((result, index) =>
        result.status === 'rejected'
          ? `${providers[index]?.id() ?? `provider-${index}`}: ${String(result.reason)}`
          : null,
      )
      .filter((failure): failure is string => failure !== null);

    providers.length = 0;

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }

    pythonUtils.state.cachedPythonPath = null;
    pythonUtils.state.validationPromise = null;

    if (previousCacheEnabled === undefined) {
      delete process.env.PROMPTFOO_CACHE_ENABLED;
    } else {
      process.env.PROMPTFOO_CACHE_ENABLED = previousCacheEnabled;
    }

    if (shutdownFailures.length > 0) {
      throw new Error(`PythonProvider shutdown failed: ${shutdownFailures.join('; ')}`);
    }
  });

  it(
    'should handle paths with colons (like C:\\ on Windows)',
    async () => {
      // This test verifies that the protocol delimiter (pipe |) doesn't conflict
      // with Windows drive letters (C:, D:, etc.) in file paths
      const result = await pathProvider.callApi('Test prompt');

      // Verify the call succeeded
      expect(result.output).toBe('Processed: Test prompt');
      expect(result.error).toBeUndefined();

      // On Windows, temp path should contain a colon (C:, D:, etc.)
      if (process.platform === 'win32') {
        expect(result.metadata?.has_colon).toBe(true);
        expect(result.metadata?.temp_path).toMatch(/^[A-Z]:\\/);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle multiple concurrent calls with Windows paths',
    async () => {
      // Stress test: ensure protocol works with multiple concurrent requests
      // where temp file paths all contain colons
      // Execute multiple calls concurrently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(concurrentProvider.callApi(`Request ${i}`));
      }

      const results = await Promise.all(promises);

      // All calls should succeed
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.error).toBeUndefined();
        expect(result.output).toBe(`Processed: Request ${index}`);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    'should parse protocol commands correctly with Windows paths',
    async () => {
      // This test verifies the internal protocol command parsing
      // Command format: CALL|function_name|request_file|response_file
      // With Windows paths: CALL|call_api|C:\path\req.json|C:\path\resp.json
      const result = await protocolProvider.callApi('Test');

      expect(result.output).toBe('Protocol parsing successful');
      expect(result.error).toBeUndefined();
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle paths with special characters',
    async () => {
      // Test that paths with various special characters work
      // (except pipe | which is the delimiter)
      const result = await specialCharsProvider.callApi('Test');

      expect(result.output).toBe('Success');
      expect(result.error).toBeUndefined();
      // Verify temp directory path was processed correctly
      expect(result.metadata?.temp_dir).toBeTruthy();
    },
    TEST_TIMEOUT,
  );
});
