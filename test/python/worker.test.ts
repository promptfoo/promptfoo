import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import logger from '../../src/logger';
import { MAX_STDERR_BUFFER_LENGTH, PythonWorker } from '../../src/python/worker';
import { mockProcessEnv } from '../util/utils';
import type { PythonShell } from 'python-shell';

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
  handleDone(responseFile: string): void;
  handleStderr(data: Buffer | string): void;
  pendingRequest: {
    responseFile: string;
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  } | null;
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

describe('PythonWorker completion markers', () => {
  it('accepts a valid response path terminated by a carriage return', () => {
    const worker = createTestableWorker();
    const responseFile = path.join(os.tmpdir(), 'response.json');
    const resolve = vi.fn();

    worker.pendingRequest = { responseFile, resolve, reject: vi.fn() };
    worker.handleDone(`${responseFile}\r`);

    expect(resolve).toHaveBeenCalledOnce();
    expect(worker.pendingRequest).toBeNull();
  });
});

describeOrSkip('PythonWorker', () => {
  it('keeps file defaults separate for concurrent Python workers', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-worker-env-'));
    const scriptPath = path.join(directory, 'provider.py');
    fs.writeFileSync(
      scriptPath,
      'import os\ndef call_api(*args):\n    return os.environ.get("PROMPTFOO_REVIEW_ENV_PROBE")\n',
    );
    const restore = mockProcessEnv({ PROMPTFOO_REVIEW_ENV_PROBE: 'host' });
    const workers = ['first', 'second'].map(() => new PythonWorker(scriptPath, 'call_api'));
    try {
      const outputs = await Promise.all(
        workers.map((worker, index) =>
          cliState.withEnvFileOverrides(
            { PROMPTFOO_REVIEW_ENV_PROBE: ['first', 'second'][index] },
            async () => {
              await worker.initialize();
              return worker.call('call_api', []);
            },
          ),
        ),
      );
      expect(outputs).toEqual(['first', 'second']);
      expect(process.env.PROMPTFOO_REVIEW_ENV_PROBE).toBe('host');
    } finally {
      await Promise.all(workers.map((worker) => worker.shutdown()));
      restore();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  let sharedWorker: PythonWorker;
  let multiApiWorker: PythonWorker;
  let errorWorker: PythonWorker;
  let nonexistentFunctionWorker: PythonWorker;
  let wrongNameWorker: PythonWorker;
  let embeddingsOnlyWorker: PythonWorker;
  let loggingWorker: PythonWorker;
  let protocolCollisionWorker: PythonWorker;
  let forgedMarkerWorker: PythonWorker;
  let noNewlineWorker: PythonWorker;
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testScriptPath = path.join(__dirname, 'fixtures', 'simple_provider.py');
  const multiApiPath = path.join(__dirname, 'fixtures', 'multi_api_provider.py');
  const errorPath = path.join(__dirname, 'fixtures', 'error_provider.py');
  const nonexistentPath = path.join(__dirname, 'fixtures', 'test_nonexistent_function.py');
  const wrongNamePath = path.join(__dirname, 'fixtures', 'test_wrong_function_name.py');
  const embeddingsOnlyPath = path.join(__dirname, 'fixtures', 'test_embeddings_only.py');
  const loggingPath = path.join(__dirname, 'fixtures', 'logging_provider.py');
  const protocolCollisionPath = path.join(__dirname, 'fixtures', 'protocol_collision_provider.py');
  const forgedMarkerPath = path.join(__dirname, 'fixtures', 'forged_marker_provider.py');
  const noNewlinePath = path.join(__dirname, 'fixtures', 'no_trailing_newline_provider.py');

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

    await fs.promises.writeFile(
      protocolCollisionPath,
      `
import time

def call_api(prompt, options, context):
    print("DONE", flush=True)
    time.sleep(0.02)
    return {"output": f"Completed: {prompt}"}
`,
    );

    // Emits a DONE| line with attacker-controlled content. The wrapper's real
    // DONE|<response_file> message must still resolve the request, and the
    // unrelated marker must be ignored without being repeated in logs.
    await fs.promises.writeFile(
      forgedMarkerPath,
      `
import time

def call_api(prompt, options, context):
    print("DONE|sensitive-provider-marker", flush=True)
    time.sleep(0.02)
    return {"output": f"Completed: {prompt}"}
`,
    );

    // Leaves the stdout cursor mid-line at import time and per call. Pre-fix,
    // the wrapper's READY / DONE|<path> markers glued onto the partial line
    // ("loading moduleREADY", "...DONE|/path"), Node's line-anchored matches
    // never fired, and init/calls hung until their timeouts.
    await fs.promises.writeFile(
      noNewlinePath,
      `
import sys

sys.stdout.write("loading module")

def call_api(prompt, options, context):
    sys.stdout.write(f"partial output for {prompt}")
    return {"output": f"Completed: {prompt}"}
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
    protocolCollisionWorker = new PythonWorker(protocolCollisionPath, 'call_api');
    forgedMarkerWorker = new PythonWorker(forgedMarkerPath, 'call_api');
    noNewlineWorker = new PythonWorker(noNewlinePath, 'call_api');

    await Promise.all([
      sharedWorker.initialize(),
      multiApiWorker.initialize(),
      errorWorker.initialize(),
      nonexistentFunctionWorker.initialize(),
      wrongNameWorker.initialize(),
      embeddingsOnlyWorker.initialize(),
      loggingWorker.initialize(),
      protocolCollisionWorker.initialize(),
      forgedMarkerWorker.initialize(),
      noNewlineWorker.initialize(),
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
        protocolCollisionWorker,
        forgedMarkerWorker,
        noNewlineWorker,
      ]
        .filter((worker): worker is PythonWorker => Boolean(worker))
        .map((worker) => worker.shutdown()),
    );

    for (const fixturePath of [
      testScriptPath,
      multiApiPath,
      errorPath,
      loggingPath,
      protocolCollisionPath,
      forgedMarkerPath,
      noNewlinePath,
    ]) {
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
    'should not treat provider stdout as a response completion marker',
    async () => {
      const result = (await protocolCollisionWorker.call('call_api', ['hello', {}, {}])) as {
        output: string;
      };
      const secondResult = (await protocolCollisionWorker.call('call_api', ['again', {}, {}])) as {
        output: string;
      };

      expect(result.output).toBe('Completed: hello');
      expect(secondResult.output).toBe('Completed: again');
    },
    TEST_TIMEOUT,
  );

  it(
    'should ignore forged DONE| markers without logging provider-controlled content',
    async () => {
      const result = (await forgedMarkerWorker.call('call_api', ['hello', {}, {}])) as {
        output: string;
      };
      const secondResult = (await forgedMarkerWorker.call('call_api', ['again', {}, {}])) as {
        output: string;
      };

      // If the worker accepted the script's forged DONE marker,
      // executeCall would resolve early, read the empty reserved response
      // file, and either throw or return undefined.
      expect(result.output).toBe('Completed: hello');
      expect(secondResult.output).toBe('Completed: again');
      expect(logger.debug).toHaveBeenCalledWith(
        'Python worker ignored DONE marker that did not match the in-flight request',
        { hasPendingRequest: true },
      );
      expect(JSON.stringify(vi.mocked(logger.debug).mock.calls)).not.toContain(
        'sensitive-provider-marker',
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'should complete when provider stdout ends without a trailing newline',
    async () => {
      const result = (await noNewlineWorker.call('call_api', ['hello', {}, {}])) as {
        output: string;
      };
      const secondResult = (await noNewlineWorker.call('call_api', ['again', {}, {}])) as {
        output: string;
      };

      expect(result.output).toBe('Completed: hello');
      expect(secondResult.output).toBe('Completed: again');
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

describeOrSkip('PythonWorker process lifecycle', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const importErrorPath = path.join(fixturesDir, 'lifecycle_import_error_provider.py');
  const slowPath = path.join(fixturesDir, 'lifecycle_slow_provider.py');
  const ignoreSignalsPath = path.join(fixturesDir, 'lifecycle_ignore_signals_provider.py');
  const cleanupPath = path.join(fixturesDir, 'lifecycle_cleanup_provider.py');
  const cleanupHelperPidPath = `${cleanupPath}.helper.pid`;
  const helperProcessPath = path.join(fixturesDir, 'lifecycle_helper_process_provider.py');
  const helperPidPath = `${helperProcessPath}.helper.pid`;

  const getProcess = (worker: PythonWorker) =>
    (worker as unknown as { process: PythonShell | null }).process;

  const isProcessAlive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  beforeAll(async () => {
    await fs.promises.mkdir(fixturesDir, { recursive: true });

    await fs.promises.writeFile(
      importErrorPath,
      `
raise RuntimeError("provider failed to import")

def call_api(prompt, options, context):
    return {"output": prompt}
`,
    );

    await fs.promises.writeFile(
      slowPath,
      `
import time

def call_api(prompt, options, context):
    if prompt == "slow":
        time.sleep(10)
    return {"output": prompt}
`,
    );

    await fs.promises.writeFile(
      ignoreSignalsPath,
      `
import signal
import time

signal.signal(signal.SIGINT, signal.SIG_IGN)
signal.signal(signal.SIGTERM, signal.SIG_IGN)

def call_api(prompt, options, context):
    if prompt == "slow":
        time.sleep(10)
    return {"output": prompt}
`,
    );

    // Starts a helper process that inherits the worker's stdout and stderr and outlives it,
    // like a script that launches a model server or a multiprocessing pool.
    await fs.promises.writeFile(
      helperProcessPath,
      `
import os
import subprocess
import sys
import time

def call_api(prompt, options, context):
    if prompt in ("slow", "crash"):
        helper = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        with open(${JSON.stringify(helperPidPath)}, "a") as pid_file:
            print(helper.pid, file=pid_file)
        if prompt == "crash":
            os._exit(1)
        time.sleep(10)
    return {"output": prompt}
`,
    );

    // Cleans up the helper it starts in a finally block, as a well-behaved script would.
    await fs.promises.writeFile(
      cleanupPath,
      `
import subprocess
import sys
import time

def call_api(prompt, options, context):
    if prompt == "slow":
        helper = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        with open(${JSON.stringify(cleanupHelperPidPath)}, "w") as pid_file:
            pid_file.write(str(helper.pid))
        try:
            time.sleep(10)
        finally:
            helper.kill()
            helper.wait()
    return {"output": prompt}
`,
    );
  });

  afterAll(async () => {
    for (const fixturePath of [
      importErrorPath,
      slowPath,
      ignoreSignalsPath,
      helperProcessPath,
      cleanupPath,
    ]) {
      fs.rmSync(fixturePath, { force: true });
    }
  });

  // Kills the helper processes a fixture started, which outlive the Python worker on purpose.
  const readHelperPids = (pidPath: string) =>
    fs.existsSync(pidPath)
      ? fs.readFileSync(pidPath, 'utf8').split(/\s+/).filter(Boolean).map(Number)
      : [];
  const readHelperPid = (pidPath: string) => readHelperPids(pidPath)[0];

  const killHelperProcess = (pidPath = helperPidPath) => {
    const helperPids = readHelperPids(pidPath);
    fs.rmSync(pidPath, { force: true });
    for (const helperPid of helperPids) {
      try {
        process.kill(helperPid, 'SIGKILL');
      } catch {
        // Already exited
      }
    }
  };

  it(
    'should fail startup immediately when the script exits before becoming ready',
    async () => {
      const worker = new PythonWorker(importErrorPath, 'call_api');

      try {
        // Previously the worker restarted the failing script and only gave up when the
        // 30s ready timeout fired, with "Worker failed to become ready within timeout".
        await expect(worker.initialize()).rejects.toThrow(
          'Python worker exited before becoming ready (exit code 1)',
        );
        expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('restarting'));
      } finally {
        await worker.shutdown();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should replace a timed-out process without counting the timeout as a crash',
    async () => {
      const worker = new PythonWorker(slowPath, 'call_api', undefined, 1000);
      await worker.initialize();

      try {
        // As many timeouts as maxCrashes: if timeouts counted as crashes the worker would die.
        for (let attempt = 0; attempt < 3; attempt++) {
          await expect(worker.call('call_api', ['slow', {}, {}])).rejects.toThrow(
            'Python worker timed out after 1000ms',
          );
          await vi.waitFor(() => expect(worker.isReady()).toBe(true), { timeout: 3_000 });
        }

        // Previously the next request was sent to the process still running the slow call,
        // so it waited behind it and timed out too.
        await expect(worker.call('call_api', ['fast', {}, {}])).resolves.toEqual({
          output: 'fast',
        });
        expect(worker.isDead()).toBe(false);
      } finally {
        await worker.shutdown();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should force-kill a timed-out process that ignores interrupt and termination signals',
    async () => {
      const worker = new PythonWorker(ignoreSignalsPath, 'call_api', undefined, 1000);
      await worker.initialize();
      const pid = getProcess(worker)?.childProcess.pid;
      expect(pid).toBeDefined();

      try {
        await expect(worker.call('call_api', ['slow', {}, {}])).rejects.toThrow(
          'Python worker timed out after 1000ms',
        );
        await vi.waitFor(() => expect(isProcessAlive(pid!)).toBe(false), { timeout: 5_000 });
        await vi.waitFor(() => expect(worker.isReady()).toBe(true), { timeout: 3_000 });
        await expect(worker.call('call_api', ['fast', {}, {}])).resolves.toEqual({
          output: 'fast',
        });
      } finally {
        await worker.shutdown();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should restart after a timeout while a subprocess still holds the worker output streams',
    async () => {
      const worker = new PythonWorker(helperProcessPath, 'call_api', undefined, 1000);
      await worker.initialize();

      try {
        await expect(worker.call('call_api', ['slow', {}, {}])).rejects.toThrow(
          'Python worker timed out after 1000ms',
        );
        // The helper keeps stdout and stderr open, so the process never "closes". The
        // worker previously waited for that forever and never restarted.
        await vi.waitFor(() => expect(worker.isReady()).toBe(true), { timeout: 5_000 });
        await expect(worker.call('call_api', ['fast', {}, {}])).resolves.toEqual({
          output: 'fast',
        });
      } finally {
        await worker.shutdown();
        killHelperProcess();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should detect a crash while a subprocess still holds the worker output streams',
    async () => {
      // Long enough that a request timeout can't be mistaken for crash detection.
      const worker = new PythonWorker(helperProcessPath, 'call_api', undefined, 10_000);
      await worker.initialize();

      try {
        await expect(worker.call('call_api', ['crash', {}, {}])).rejects.toThrow(
          'Worker crashed (exit code 1)',
        );
      } finally {
        await worker.shutdown();
        killHelperProcess();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should count a crash toward the limit when the request times out before the exit is handled',
    async () => {
      // Shorter than the output-stream drain, so the timeout fires before the crash is handled.
      const worker = new PythonWorker(helperProcessPath, 'call_api', undefined, 800);
      await worker.initialize();

      try {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await expect(worker.call('call_api', ['crash', {}, {}])).rejects.toThrow(
            'Worker crashed (exit code 1)',
          );
          if (attempt < 3) {
            await vi.waitFor(() => expect(worker.isReady()).toBe(true), { timeout: 5_000 });
          }
        }
        // Previously each crash was handled as a timeout, which doesn't count toward the
        // limit, so the worker kept restarting instead of stopping after three in a row.
        await vi.waitFor(() => expect(worker.isDead()).toBe(true), { timeout: 5_000 });
      } finally {
        await worker.shutdown();
        killHelperProcess();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should let a timed-out script clean up the subprocesses it started',
    async () => {
      const worker = new PythonWorker(cleanupPath, 'call_api', undefined, 1000);
      await worker.initialize();

      try {
        await expect(worker.call('call_api', ['slow', {}, {}])).rejects.toThrow(
          'Python worker timed out after 1000ms',
        );
        const helperPid = readHelperPid(cleanupHelperPidPath);
        expect(helperPid).toBeDefined();
        // The worker is interrupted rather than terminated outright, so the script's finally
        // block runs and stops its helper before the process is replaced.
        await vi.waitFor(() => expect(isProcessAlive(helperPid!)).toBe(false), {
          timeout: 5_000,
        });
      } finally {
        await worker.shutdown();
        killHelperProcess(cleanupHelperPidPath);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should wait for a timed-out process to stop before shutdown resolves',
    async () => {
      // Ignores SIGINT and SIGTERM, so stopping it takes the full grace period before SIGKILL.
      const worker = new PythonWorker(ignoreSignalsPath, 'call_api', undefined, 1000);
      await worker.initialize();
      const pid = getProcess(worker)?.childProcess.pid;
      expect(pid).toBeDefined();

      await expect(worker.call('call_api', ['slow', {}, {}])).rejects.toThrow(
        'Python worker timed out after 1000ms',
      );
      // Shut down while the timed-out process is still being stopped. Previously shutdown
      // returned at once and left that process running.
      await worker.shutdown();

      expect(isProcessAlive(pid!)).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'should not start a new process when shut down while a call is being dispatched',
    async () => {
      const worker = new PythonWorker(slowPath, 'call_api', undefined, 1000);
      await worker.initialize();

      // shutdown() runs while call() is still writing its request files.
      const call = worker.call('call_api', ['fast', {}, {}]);
      const shutdown = worker.shutdown();

      await expect(call).rejects.toThrow('Worker shutting down');
      await shutdown;

      // Previously the request stayed pending until its timeout fired after shutdown and
      // restarted the worker, leaving a Python process that nothing would ever stop. No
      // request timer may remain armed, and nothing may be running.
      expect((worker as unknown as { requestTimeout: unknown }).requestTimeout).toBeNull();
      expect(getProcess(worker)).toBeNull();
      expect(worker.isReady()).toBe(false);
      expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('restarting'));
      await expect(worker.call('call_api', ['after shutdown', {}, {}])).rejects.toThrow(
        'Worker shutting down',
      );
    },
    TEST_TIMEOUT,
  );
});
