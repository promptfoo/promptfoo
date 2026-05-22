import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { MAX_STDERR_BUFFER_LENGTH, PythonWorker } from '../../src/python/worker';

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

type TestablePythonWorker = {
  flushStderr(): void;
  handleStderr(data: Buffer | string): void;
};

function createTestableWorker() {
  return new PythonWorker(
    path.join(os.tmpdir(), 'provider.py'),
    'call_api',
  ) as unknown as TestablePythonWorker;
}

describe('PythonWorker stderr parsing', () => {
  it('honors explicit INFO and DEBUG prefixes before scanning message text', () => {
    const worker = createTestableWorker();

    worker.handleStderr('INFO:loaded error budget config\nDEBUG:error retry state\n');

    expect(logger.info).toHaveBeenCalledWith(
      'Python worker stderr: INFO:loaded error budget config',
    );
    expect(logger.debug).toHaveBeenCalledWith('Python worker stderr: DEBUG:error retry state');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps traceback continuation lines at error level and preserves indentation', () => {
    const worker = createTestableWorker();

    worker.handleStderr(
      [
        'ERROR: Failed to load module: boom',
        'Traceback (most recent call last):',
        '  File "/tmp/provider.py", line 1, in <module>',
        '    raise ValueError("boom")',
        'ValueError: boom',
        '',
      ].join('\n'),
    );

    expect(logger.error).toHaveBeenCalledWith(
      'Python worker stderr: ERROR: Failed to load module: boom',
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Python worker stderr: Traceback (most recent call last):',
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Python worker stderr:   File "/tmp/provider.py", line 1, in <module>',
    );
    expect(logger.error).toHaveBeenCalledWith('Python worker stderr:     raise ValueError("boom")');
    expect(logger.error).toHaveBeenCalledWith('Python worker stderr: ValueError: boom');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('classifies the standard Python logging format (LEVEL:name:message)', () => {
    const worker = createTestableWorker();

    worker.handleStderr(
      ['DEBUG:root:retry state', 'INFO:root:loaded config', 'WARNING:urllib3:pool full', ''].join(
        '\n',
      ),
    );

    expect(logger.debug).toHaveBeenCalledWith('Python worker stderr: DEBUG:root:retry state');
    expect(logger.info).toHaveBeenCalledWith('Python worker stderr: INFO:root:loaded config');
    expect(logger.warn).toHaveBeenCalledWith('Python worker stderr: WARNING:urllib3:pool full');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('ends a traceback at its exception summary without a trailing blank line', () => {
    const worker = createTestableWorker();

    // A real traceback.print_exc() emits no trailing blank line. The summary
    // line itself must terminate the traceback so later stderr is not poisoned.
    worker.handleStderr(
      [
        'Traceback (most recent call last):',
        '  File "/tmp/provider.py", line 1, in <module>',
        'ValueError: boom',
        '',
      ].join('\n'),
    );

    worker.handleStderr('routine progress from the next call\n');

    expect(logger.error).toHaveBeenCalledWith('Python worker stderr: ValueError: boom');
    expect(logger.warn).toHaveBeenCalledWith(
      'Python worker stderr: routine progress from the next call',
    );
    expect(logger.error).not.toHaveBeenCalledWith(
      'Python worker stderr: routine progress from the next call',
    );
  });

  it('does not leak traceback state across calls in a long-lived worker', () => {
    const worker = createTestableWorker();

    // Call 1 prints a handled traceback (no trailing blank line).
    worker.handleStderr(
      'Traceback (most recent call last):\n  File "x", line 1\nValueError: boom\n',
    );
    // Call 2 emits a plain, unprefixed stderr line.
    worker.handleStderr('plain progress line\n');

    expect(logger.error).not.toHaveBeenCalledWith('Python worker stderr: plain progress line');
    expect(logger.warn).toHaveBeenCalledWith('Python worker stderr: plain progress line');
  });

  it('keeps chained exception reports coherent at error level', () => {
    const worker = createTestableWorker();

    worker.handleStderr(
      [
        'Traceback (most recent call last):',
        '  File "x", line 1',
        'ValueError: inner',
        '',
        'During handling of the above exception, another exception occurred:',
        '',
        'Traceback (most recent call last):',
        '  File "x", line 2',
        'RuntimeError: outer',
        '',
      ].join('\n'),
    );

    expect(logger.error).toHaveBeenCalledWith('Python worker stderr: ValueError: inner');
    expect(logger.error).toHaveBeenCalledWith(
      'Python worker stderr: During handling of the above exception, another exception occurred:',
    );
    expect(logger.error).toHaveBeenCalledWith('Python worker stderr: RuntimeError: outer');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not mistake an indented traceback source line for a log prefix', () => {
    const worker = createTestableWorker();

    // The displayed source frame happens to start with the word INFO.
    worker.handleStderr(
      [
        'Traceback (most recent call last):',
        '  File "/tmp/provider.py", line 2, in call_api',
        '    INFO = build_info()',
        'ValueError: boom',
        '',
      ].join('\n'),
    );

    expect(logger.error).toHaveBeenCalledWith('Python worker stderr:     INFO = build_info()');
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('keeps a buffered final traceback line at error level on flush', () => {
    const worker = createTestableWorker();

    // Worker dies mid-write: the exception summary has no trailing newline.
    worker.handleStderr('Traceback (most recent call last):\n  File "x", line 1\nValueError: boom');
    worker.flushStderr();

    expect(logger.error).toHaveBeenCalledWith('Python worker stderr: ValueError: boom');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps traceback continuation at error level when a CRLF pair is split across chunks', () => {
    const worker = createTestableWorker();

    worker.handleStderr('Traceback (most recent call last):\r');
    worker.handleStderr('\n  File "x", line 1\r\nValueError: boom\r\n');

    expect(logger.error).toHaveBeenCalledWith(
      'Python worker stderr: Traceback (most recent call last):',
    );
    expect(logger.error).toHaveBeenCalledWith('Python worker stderr:   File "x", line 1');
    expect(logger.error).toHaveBeenCalledWith('Python worker stderr: ValueError: boom');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('decodes multi-byte stderr characters split across buffer chunks', () => {
    const worker = createTestableWorker();
    const full = Buffer.from('INFO:café\n', 'utf8');

    // Split inside the two-byte UTF-8 sequence for é.
    worker.handleStderr(full.subarray(0, full.length - 2));
    expect(logger.info).not.toHaveBeenCalled();

    worker.handleStderr(full.subarray(full.length - 2));
    expect(logger.info).toHaveBeenCalledWith('Python worker stderr: INFO:café');
  });

  it('does not treat a one-line ERROR log as traceback continuation state', () => {
    const worker = createTestableWorker();

    worker.handleStderr('ERROR:provider reported a recoverable issue\nplain stderr later\n');

    expect(logger.error).toHaveBeenCalledWith(
      'Python worker stderr: ERROR:provider reported a recoverable issue',
    );
    expect(logger.warn).toHaveBeenCalledWith('Python worker stderr: plain stderr later');
  });

  it('buffers split stderr chunks before classifying complete lines', () => {
    const worker = createTestableWorker();

    worker.handleStderr('IN');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();

    worker.handleStderr('FO:loaded error budget config\n');

    expect(logger.info).toHaveBeenCalledWith(
      'Python worker stderr: INFO:loaded error budget config',
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('flushes an unterminated buffered stderr line', () => {
    const worker = createTestableWorker();

    worker.handleStderr('WARNING:partial stderr line');
    expect(logger.warn).not.toHaveBeenCalled();

    worker.flushStderr();

    expect(logger.warn).toHaveBeenCalledWith('Python worker stderr: WARNING:partial stderr line');
  });

  it('treats bare carriage returns as line delimiters', () => {
    const worker = createTestableWorker();

    // Each \r that is followed by more data is a complete line ending.
    worker.handleStderr('INFO:step 1\rINFO:step 2\rINFO:step 3\n');

    expect(logger.info).toHaveBeenCalledWith('Python worker stderr: INFO:step 1');
    expect(logger.info).toHaveBeenCalledWith('Python worker stderr: INFO:step 2');
    expect(logger.info).toHaveBeenCalledWith('Python worker stderr: INFO:step 3');
  });

  it('holds a trailing carriage return until the next chunk disambiguates it', () => {
    const worker = createTestableWorker();

    // A trailing \r might be the first half of a split \r\n, so it waits.
    worker.handleStderr('INFO:buffered step\r');
    expect(logger.info).not.toHaveBeenCalled();

    worker.flushStderr();
    expect(logger.info).toHaveBeenCalledWith('Python worker stderr: INFO:buffered step');
  });

  it('bounds an unterminated stderr buffer', () => {
    const worker = createTestableWorker();
    const longLine = 'x'.repeat(MAX_STDERR_BUFFER_LENGTH);

    worker.handleStderr(longLine);

    expect(logger.warn).toHaveBeenCalledWith(`Python worker stderr: ${longLine}`);
  });
});

describeOrSkip('PythonWorker', () => {
  let sharedWorker: PythonWorker;
  let multiApiWorker: PythonWorker;
  let errorWorker: PythonWorker;
  let nonexistentFunctionWorker: PythonWorker;
  let wrongNameWorker: PythonWorker;
  let embeddingsOnlyWorker: PythonWorker;
  let loggingWorker: PythonWorker;
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testScriptPath = path.join(__dirname, 'fixtures', 'simple_provider.py');
  const multiApiPath = path.join(__dirname, 'fixtures', 'multi_api_provider.py');
  const errorPath = path.join(__dirname, 'fixtures', 'error_provider.py');
  const nonexistentPath = path.join(__dirname, 'fixtures', 'test_nonexistent_function.py');
  const wrongNamePath = path.join(__dirname, 'fixtures', 'test_wrong_function_name.py');
  const embeddingsOnlyPath = path.join(__dirname, 'fixtures', 'test_embeddings_only.py');
  const loggingPath = path.join(__dirname, 'fixtures', 'logging_provider.py');

  beforeAll(async () => {
    // Create test fixture
    await fs.promises.mkdir(fixturesDir, { recursive: true });

    await fs.promises.writeFile(
      testScriptPath,
      `
def call_api(prompt, options, context):
    return {"output": f"Echo: {prompt}"}
`,
    );

    await fs.promises.writeFile(
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

    await fs.promises.writeFile(
      errorPath,
      `
def call_api(prompt, options, context):
    if prompt == "error":
        raise ValueError("Intentional error for testing")
    return {"output": f"Success: {prompt}"}
`,
    );

    // Uses Python's default logging format (LEVEL:name:message) so the test
    // exercises what real providers emit when they don't customize logging.
    await fs.promises.writeFile(
      loggingPath,
      `
import logging

logging.basicConfig(level=logging.INFO)

def call_api(prompt, options, context):
    logging.info("provider startup details")
    logging.warning("provider warning")
    return {"output": f"Logged: {prompt}"}
`,
    );

    await Promise.all([
      fs.promises.access(nonexistentPath),
      fs.promises.access(wrongNamePath),
      fs.promises.access(embeddingsOnlyPath),
    ]);

    sharedWorker = new PythonWorker(testScriptPath, 'call_api');
    multiApiWorker = new PythonWorker(multiApiPath, 'call_api');
    errorWorker = new PythonWorker(errorPath, 'call_api');
    nonexistentFunctionWorker = new PythonWorker(nonexistentPath, 'call_api');
    wrongNameWorker = new PythonWorker(wrongNamePath, 'call_api');
    embeddingsOnlyWorker = new PythonWorker(embeddingsOnlyPath, 'call_api');
    loggingWorker = new PythonWorker(loggingPath, 'call_api');

    await Promise.all([
      sharedWorker.initialize(),
      multiApiWorker.initialize(),
      errorWorker.initialize(),
      nonexistentFunctionWorker.initialize(),
      wrongNameWorker.initialize(),
      embeddingsOnlyWorker.initialize(),
      loggingWorker.initialize(),
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
        loggingWorker,
      ]
        .filter((worker): worker is PythonWorker => Boolean(worker))
        .map((worker) => worker.shutdown()),
    );

    for (const fixturePath of [testScriptPath, multiApiPath, errorPath, loggingPath]) {
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
    'should not surface routine Python stderr logging as worker errors',
    async () => {
      const result = (await loggingWorker.call('call_api', ['hello', {}, {}])) as {
        output: string;
      };

      expect(result.output).toBe('Logged: hello');
      expect(logger.error).not.toHaveBeenCalled();
      // Default Python logging format is LEVEL:name:message (e.g. WARNING:root:...).
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Python worker stderr: WARNING:root:provider warning'),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Python worker stderr: INFO:root:provider startup details'),
      );
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
