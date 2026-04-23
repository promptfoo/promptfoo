import fs from 'fs';
import { createServer } from 'http';
import path from 'path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { PythonWorker } from '../../src/python/worker';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

// Windows CI has severe filesystem delays (antivirus, etc.) - allow up to 90s
// Non-Windows CI can also have timing variance with Python IPC, so use 15s (matching windows-path.test.ts)
const TEST_TIMEOUT = process.platform === 'win32' ? 90000 : 15000;

// Skip on Windows CI due to aggressive file security policies blocking temp file IPC
// Works fine on local Windows and all other platforms
const describeOrSkip = process.platform === 'win32' && process.env.CI ? describe.skip : describe;

describeOrSkip('PythonWorker', () => {
  let sharedWorker: PythonWorker;
  let multiApiWorker: PythonWorker;
  let errorWorker: PythonWorker;
  let nonexistentFunctionWorker: PythonWorker;
  let wrongNameWorker: PythonWorker;
  let embeddingsOnlyWorker: PythonWorker;
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testScriptPath = path.join(__dirname, 'fixtures', 'simple_provider.py');
  const multiApiPath = path.join(__dirname, 'fixtures', 'multi_api_provider.py');
  const errorPath = path.join(__dirname, 'fixtures', 'error_provider.py');
  const nonexistentPath = path.join(__dirname, 'fixtures', 'test_nonexistent_function.py');
  const wrongNamePath = path.join(__dirname, 'fixtures', 'test_wrong_function_name.py');
  const embeddingsOnlyPath = path.join(__dirname, 'fixtures', 'test_embeddings_only.py');

  beforeAll(async () => {
    // Create test fixture
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    fs.writeFileSync(
      testScriptPath,
      `
def call_api(prompt, options, context):
    return {"output": f"Echo: {prompt}"}
`,
    );

    fs.writeFileSync(
      multiApiPath,
      `
def call_api(prompt, options, context):
    return {"output": f"text: {prompt}", "type": "text"}

def call_embedding_api(prompt, options, context):
    return {"output": [0.1, 0.2, 0.3], "type": "embedding"}

def call_classification_api(prompt, options, context):
    return {"output": "positive", "type": "classification"}
`,
    );

    fs.writeFileSync(
      errorPath,
      `
def call_api(prompt, options, context):
    if prompt == "error":
        raise ValueError("Intentional error for testing")
    return {"output": f"Success: {prompt}"}
`,
    );

    sharedWorker = new PythonWorker(testScriptPath, 'call_api');
    multiApiWorker = new PythonWorker(multiApiPath, 'call_api');
    errorWorker = new PythonWorker(errorPath, 'call_api');
    nonexistentFunctionWorker = new PythonWorker(nonexistentPath, 'call_api');
    wrongNameWorker = new PythonWorker(wrongNamePath, 'call_api');
    embeddingsOnlyWorker = new PythonWorker(embeddingsOnlyPath, 'call_api');

    await Promise.all([
      sharedWorker.initialize(),
      multiApiWorker.initialize(),
      errorWorker.initialize(),
      nonexistentFunctionWorker.initialize(),
      wrongNameWorker.initialize(),
      embeddingsOnlyWorker.initialize(),
    ]);
  });

  afterAll(async () => {
    await Promise.all(
      [
        sharedWorker,
        multiApiWorker,
        errorWorker,
        nonexistentFunctionWorker,
        wrongNameWorker,
        embeddingsOnlyWorker,
      ]
        .filter((worker): worker is PythonWorker => Boolean(worker))
        .map((worker) => worker.shutdown()),
    );

    for (const fixturePath of [testScriptPath, multiApiPath, errorPath]) {
      if (fs.existsSync(fixturePath)) {
        fs.unlinkSync(fixturePath);
      }
    }
  });

  it(
    'should initialize and become ready',
    async () => {
      expect(sharedWorker.isReady()).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'should execute a function call',
    async () => {
      const result = (await sharedWorker.call('call_api', ['Hello world', {}, {}])) as {
        output: string;
      };
      expect(result.output).toBe('Echo: Hello world');
    },
    TEST_TIMEOUT,
  );

  it('should not log successful wrapper OTEL startup stderr as an error', () => {
    const worker = new PythonWorker(testScriptPath, 'call_api');
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    try {
      (worker as any).handleStderr(
        '[PythonProvider] OpenTelemetry tracing enabled, endpoint: http://127.0.0.1:4318/v1/traces\n',
      );

      expect(debugSpy).toHaveBeenCalledWith(
        'Python worker stderr: [PythonProvider] OpenTelemetry tracing enabled, endpoint: http://127.0.0.1:4318/v1/traces',
      );
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('should log wrapper OTEL fallback stderr as a warning', () => {
    const worker = new PythonWorker(testScriptPath, 'call_api');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    try {
      (worker as any).handleStderr(
        '[PythonProvider] OpenTelemetry packages not installed, tracing disabled.',
      );

      expect(warnSpy).toHaveBeenCalledWith(
        'Python worker stderr: [PythonProvider] OpenTelemetry packages not installed, tracing disabled.',
      );
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('should log Python warnings on stderr as warnings', () => {
    const worker = new PythonWorker(testScriptPath, 'call_api');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    try {
      (worker as any).handleStderr(
        '/venv/lib/python3.9/site-packages/urllib3/__init__.py:35: NotOpenSSLWarning: urllib3 v2 only supports OpenSSL 1.1.1+\n  warnings.warn(',
      );

      expect(warnSpy).toHaveBeenCalledWith(
        'Python worker stderr: /venv/lib/python3.9/site-packages/urllib3/__init__.py:35: NotOpenSSLWarning: urllib3 v2 only supports OpenSSL 1.1.1+',
      );
      expect(warnSpy).toHaveBeenCalledWith('Python worker stderr:   warnings.warn(');
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('should keep arbitrary stderr containing OTEL text at error level', () => {
    const worker = new PythonWorker(testScriptPath, 'call_api');
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    try {
      (worker as any).handleStderr(
        'user stderr: [PythonProvider] OpenTelemetry tracing enabled but this is not wrapper startup',
      );

      expect(errorSpy).toHaveBeenCalledWith(
        'Python worker stderr: user stderr: [PythonProvider] OpenTelemetry tracing enabled but this is not wrapper startup',
      );
      expect(debugSpy).not.toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it(
    'should pass environment overrides to the Python process',
    async () => {
      const envPath = path.join(__dirname, 'fixtures', 'env_provider.py');
      let worker: PythonWorker | undefined;
      fs.writeFileSync(
        envPath,
        `
import os

def call_api(prompt, options, context):
    return {
        "output": "ok",
        "otel_enabled": os.getenv("PROMPTFOO_ENABLE_OTEL"),
        "otlp_endpoint": os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
    }
`,
      );

      try {
        worker = new PythonWorker(envPath, 'call_api', undefined, undefined, undefined, {
          PROMPTFOO_ENABLE_OTEL: 'true',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector.local:4318',
        });
        await worker.initialize();

        const result = (await worker.call('call_api', ['Hello world', {}, {}])) as {
          otel_enabled: string;
          otlp_endpoint: string;
        };
        expect(result.otel_enabled).toBe('true');
        expect(result.otlp_endpoint).toBe('http://collector.local:4318');
      } finally {
        await worker?.shutdown();
        if (fs.existsSync(envPath)) {
          fs.unlinkSync(envPath);
        }
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should lazily enable OTEL env when a traced call reaches an untraced worker',
    async () => {
      const envPath = path.join(__dirname, 'fixtures', 'lazy_otel_provider.py');
      const restoreEnv = mockProcessEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
        PROMPTFOO_ENABLE_OTEL: undefined,
        PROMPTFOO_OTEL_ENDPOINT: undefined,
      });
      const otlpServer = createServer((req, res) => {
        req.resume();
        res.writeHead(200);
        res.end();
      });
      let worker: PythonWorker | undefined;
      await new Promise<void>((resolve) => otlpServer.listen(0, '127.0.0.1', resolve));
      const otlpEndpoint = `http://127.0.0.1:${(otlpServer.address() as { port: number }).port}`;

      fs.writeFileSync(
        envPath,
        `
import os

def call_api(prompt, options, context):
    return {
        "output": "ok",
        "otel_enabled": os.getenv("PROMPTFOO_ENABLE_OTEL"),
        "otlp_endpoint": os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
    }
`,
      );

      try {
        worker = new PythonWorker(envPath, 'call_api');
        await worker.initialize();

        const result = (await worker.call('call_api', [
          'Hello world',
          {},
          {
            traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
            otelExporterOtlpEndpoint: otlpEndpoint,
          },
        ])) as {
          otel_enabled: string;
          otlp_endpoint: string;
        };

        expect(result.otel_enabled).toBe('true');
        expect(result.otlp_endpoint).toBe(otlpEndpoint);
      } finally {
        restoreEnv();
        await worker?.shutdown();
        await new Promise<void>((resolve, reject) =>
          otlpServer.close((error) => (error ? reject(error) : resolve())),
        );
        if (fs.existsSync(envPath)) {
          fs.unlinkSync(envPath);
        }
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should not lazily enable OTEL without an endpoint for a traced call',
    async () => {
      const envPath = path.join(__dirname, 'fixtures', 'lazy_otel_no_endpoint_provider.py');
      const restoreEnv = mockProcessEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
        PROMPTFOO_ENABLE_OTEL: undefined,
        PROMPTFOO_OTEL_ENDPOINT: undefined,
      });
      let worker: PythonWorker | undefined;
      fs.writeFileSync(
        envPath,
        `
import os

def call_api(prompt, options, context):
    return {
        "output": "ok",
        "otel_enabled": os.getenv("PROMPTFOO_ENABLE_OTEL"),
        "otlp_endpoint": os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
    }
`,
      );

      try {
        worker = new PythonWorker(envPath, 'call_api');
        await worker.initialize();

        const result = (await worker.call('call_api', [
          'Hello world',
          {},
          {
            traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
          },
        ])) as {
          otel_enabled: string | null;
          otlp_endpoint: string | null;
        };

        expect(result.otel_enabled).toBeNull();
        expect(result.otlp_endpoint).toBeNull();
      } finally {
        restoreEnv();
        await worker?.shutdown();
        if (fs.existsSync(envPath)) {
          fs.unlinkSync(envPath);
        }
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should reuse the same process for multiple calls',
    async () => {
      const result1 = (await sharedWorker.call('call_api', ['First', {}, {}])) as {
        output: string;
      };
      const result2 = (await sharedWorker.call('call_api', ['Second', {}, {}])) as {
        output: string;
      };

      expect(result1.output).toBe('Echo: First');
      expect(result2.output).toBe('Echo: Second');
      // Same process should be used (we'll verify in implementation)
    },
    TEST_TIMEOUT,
  );

  it(
    'should call different function names dynamically per request',
    async () => {
      // Call different functions in the same worker
      const textResult = await multiApiWorker.call('call_api', ['hello', {}, {}]);
      const embeddingResult = await multiApiWorker.call('call_embedding_api', ['hello', {}, {}]);
      const classResult = await multiApiWorker.call('call_classification_api', ['hello', {}, {}]);

      // Verify each function was called correctly
      expect((textResult as Record<string, unknown>).type).toBe('text');
      expect((textResult as Record<string, unknown>).output).toBe('text: hello');

      expect((embeddingResult as Record<string, unknown>).type).toBe('embedding');
      expect((embeddingResult as Record<string, unknown>).output).toEqual([0.1, 0.2, 0.3]);

      expect((classResult as Record<string, unknown>).type).toBe('classification');
      expect((classResult as Record<string, unknown>).output).toBe('positive');
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle Python errors gracefully',
    async () => {
      // Should succeed
      const goodResult = (await errorWorker.call('call_api', ['good', {}, {}])) as Record<
        string,
        unknown
      >;
      expect(goodResult.output).toBe('Success: good');

      // Should throw error
      await expect(errorWorker.call('call_api', ['error', {}, {}])).rejects.toThrow(
        'Intentional error',
      );

      // Worker should still be usable after error
      const afterErrorResult = (await errorWorker.call('call_api', [
        'still works',
        {},
        {},
      ])) as Record<string, unknown>;
      expect(afterErrorResult.output).toBe('Success: still works');
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle calling non-existent function gracefully',
    async () => {
      // Try to call a function that doesn't exist
      // This should throw an error about the function not existing, not ENOENT
      await expect(
        nonexistentFunctionWorker.call('call_nonexistent_api', ['test', {}]),
      ).rejects.toThrow(/has no attribute|AttributeError/);
    },
    TEST_TIMEOUT,
  );

  it(
    'should provide helpful error message with function name suggestions',
    async () => {
      // User has 'get_embedding_api' but we're looking for 'call_embedding_api'
      try {
        await wrongNameWorker.call('call_embedding_api', ['test', {}]);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        const errorMessage = error.message;

        // Should include helpful information
        expect(errorMessage).toContain("Function 'call_embedding_api' not found");
        expect(errorMessage).toContain('Available functions in your module');
        expect(errorMessage).toContain('get_embedding_api'); // Shows what they have
        expect(errorMessage).toContain('Expected function names for promptfoo');
        expect(errorMessage).toContain('call_api'); // Shows valid options
        expect(errorMessage).toContain('call_embedding_api');
        expect(errorMessage).toContain('call_classification_api');
        expect(errorMessage).toContain('Did you mean to rename'); // Fuzzy match suggestion
        expect(errorMessage).toContain('promptfoo.dev/docs/providers/python'); // Doc link

        // Should NOT be generic ENOENT error
        expect(errorMessage).not.toContain('ENOENT');
        expect(errorMessage).not.toContain('no such file or directory');
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should support embeddings-only provider without call_api defined',
    async () => {
      // Call the embedding function directly
      const result: any = await embeddingsOnlyWorker.call('call_embedding_api', [
        'test prompt',
        {},
      ]);

      // Should return valid embedding
      expect(result).toHaveProperty('embedding');
      expect(Array.isArray(result.embedding)).toBe(true);
      expect(result.embedding.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );
});
