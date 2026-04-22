import fs from 'fs';
import path from 'path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PythonWorker } from '../../src/python/worker';

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
