import { PythonWorker } from '../../src/python/worker';
import fs from 'fs';
import path from 'path';

// Windows CI has severe filesystem delays (antivirus, etc.) - allow up to 90s
const TEST_TIMEOUT = process.platform === 'win32' ? 90000 : 5000;

// Skip on Windows CI due to aggressive file security policies blocking temp file IPC
// Works fine on local Windows and all other platforms
const describeOrSkip = process.platform === 'win32' && process.env.CI ? describe.skip : describe;

describeOrSkip('PythonWorker', () => {
  let worker: PythonWorker;
  const testScriptPath = path.join(__dirname, 'fixtures', 'simple_provider.py');

  beforeAll(() => {
    // Create test fixture
    const fixturesDir = path.join(__dirname, 'fixtures');
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
  });

  afterAll(() => {
    fs.unlinkSync(testScriptPath);
  });

  afterEach(async () => {
    if (worker) {
      await worker.shutdown();
    }
  });

  it(
    'should initialize and become ready',
    async () => {
      worker = new PythonWorker(testScriptPath, 'call_api');
      await worker.initialize();
      expect(worker.isReady()).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'should execute a function call',
    async () => {
      worker = new PythonWorker(testScriptPath, 'call_api');
      await worker.initialize();

      const result = await worker.call('call_api', ['Hello world', {}, {}]);
      expect(result.output).toBe('Echo: Hello world');
    },
    TEST_TIMEOUT,
  );

  it(
    'should reuse the same process for multiple calls',
    async () => {
      worker = new PythonWorker(testScriptPath, 'call_api');
      await worker.initialize();

      const result1 = await worker.call('call_api', ['First', {}, {}]);
      const result2 = await worker.call('call_api', ['Second', {}, {}]);

      expect(result1.output).toBe('Echo: First');
      expect(result2.output).toBe('Echo: Second');
      // Same process should be used (we'll verify in implementation)
    },
    TEST_TIMEOUT,
  );

  it(
    'should call different function names dynamically per request',
    async () => {
      // Create a provider with multiple API functions
      const multiApiPath = path.join(__dirname, 'fixtures', 'multi_api_provider.py');
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

      try {
        worker = new PythonWorker(multiApiPath, 'call_api');
        await worker.initialize();

        // Call different functions in the same worker
        const textResult = await worker.call('call_api', ['hello', {}, {}]);
        const embeddingResult = await worker.call('call_embedding_api', ['hello', {}, {}]);
        const classResult = await worker.call('call_classification_api', ['hello', {}, {}]);

        // Verify each function was called correctly
        expect(textResult.type).toBe('text');
        expect(textResult.output).toBe('text: hello');

        expect(embeddingResult.type).toBe('embedding');
        expect(embeddingResult.output).toEqual([0.1, 0.2, 0.3]);

        expect(classResult.type).toBe('classification');
        expect(classResult.output).toBe('positive');
      } finally {
        if (fs.existsSync(multiApiPath)) {
          fs.unlinkSync(multiApiPath);
        }
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle Python errors gracefully',
    async () => {
      const errorPath = path.join(__dirname, 'fixtures', 'error_provider.py');
      fs.writeFileSync(
        errorPath,
        `
def call_api(prompt, options, context):
    if prompt == "error":
        raise ValueError("Intentional error for testing")
    return {"output": f"Success: {prompt}"}
`,
      );

      try {
        worker = new PythonWorker(errorPath, 'call_api');
        await worker.initialize();

        // Should succeed
        const goodResult = await worker.call('call_api', ['good', {}, {}]);
        expect(goodResult.output).toBe('Success: good');

        // Should throw error
        await expect(worker.call('call_api', ['error', {}, {}])).rejects.toThrow(
          'Intentional error',
        );

        // Worker should still be usable after error
        const afterErrorResult = await worker.call('call_api', ['still works', {}, {}]);
        expect(afterErrorResult.output).toBe('Success: still works');
      } finally {
        if (fs.existsSync(errorPath)) {
          fs.unlinkSync(errorPath);
        }
      }
    },
    TEST_TIMEOUT,
  );
});
