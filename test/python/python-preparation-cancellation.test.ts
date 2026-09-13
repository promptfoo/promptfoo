import fs from 'fs/promises';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPython, state } from '../../src/python/pythonUtils';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from '../../src/util/secureTempFiles';

const { execFileAsync, pythonShell } = vi.hoisted(() => ({
  execFileAsync: vi.fn(),
  pythonShell: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: execFileAsync,
  }),
}));

vi.mock('python-shell', () => ({ PythonShell: pythonShell }));

vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../src/util/secureTempFiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/util/secureTempFiles')>();
  return {
    createSecureTempDirectory: vi.fn(actual.createSecureTempDirectory),
    removeSecureTempDirectory: vi.fn(actual.removeSecureTempDirectory),
    writeSecureTempFile: vi.fn(actual.writeSecureTempFile),
  };
});

const realTempFiles = await vi.importActual<typeof import('../../src/util/secureTempFiles')>(
  '../../src/util/secureTempFiles',
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('runPython preparation cancellation', () => {
  let fixtureDirectory: string;
  let scriptPath: string;
  const createdDirectories: string[] = [];

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    state.cachedPythonPath = null;
    state.validationPromise = null;
    createdDirectories.length = 0;

    fixtureDirectory = await realTempFiles.createSecureTempDirectory('python-cancellation-test-');
    scriptPath = await realTempFiles.writeSecureTempFile(
      fixtureDirectory,
      'provider.py',
      'def call_api(*args):\n    return {"output": "prepared"}\n',
    );

    execFileAsync.mockResolvedValue({ stdout: 'Python 3.12.0\n', stderr: '' });
    vi.mocked(createSecureTempDirectory).mockImplementation(async (prefix) => {
      const directory = await realTempFiles.createSecureTempDirectory(prefix);
      createdDirectories.push(directory);
      return directory;
    });
    vi.mocked(writeSecureTempFile).mockImplementation(realTempFiles.writeSecureTempFile);
    vi.mocked(removeSecureTempDirectory).mockImplementation(
      realTempFiles.removeSecureTempDirectory,
    );

    // Substitute only the process boundary; preparation and result files remain real.
    pythonShell.mockImplementation(function (_wrapper: string, options: { args: string[] }) {
      return {
        end(callback: (error?: Error) => void) {
          void fs
            .writeFile(
              options.args[3],
              JSON.stringify({ type: 'final_result', data: { output: 'prepared' } }),
            )
            .then(() => callback(), callback);
        },
      };
    });
  });

  afterEach(async () => {
    await Promise.all(
      [fixtureDirectory, ...createdDirectories].map((directory) =>
        realTempFiles.removeSecureTempDirectory(directory),
      ),
    );
    state.cachedPythonPath = null;
    state.validationPromise = null;
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('preserves an already-aborted reason without starting executable validation', async () => {
    const controller = new AbortController();
    const reason = { source: 'cancelled before Python preparation' };
    controller.abort(reason);
    const options = { pythonExecutable: 'configured-python', abortSignal: controller.signal };

    const outcome = await runPython(scriptPath, 'call_api', [], options).catch((error) => error);

    expect(outcome).toBe(reason);
    expect(execFileAsync).not.toHaveBeenCalled();
    expect(createSecureTempDirectory).not.toHaveBeenCalled();
    expect(pythonShell).not.toHaveBeenCalled();
  });

  it('cancels after held validation without cancelling another caller sharing that validation', async () => {
    const validationStarted = deferred<void>();
    const validationRelease = deferred<{ stdout: string; stderr: string }>();
    execFileAsync.mockImplementationOnce(() => {
      validationStarted.resolve();
      return validationRelease.promise;
    });
    const controller = new AbortController();
    const reason = new Error('cancelled during executable validation');
    const options = { pythonExecutable: 'configured-python', abortSignal: controller.signal };
    const cancelled = runPython(scriptPath, 'cancelled_call', [], options).catch((error) => error);
    let surviving: Promise<unknown> | undefined;

    try {
      await validationStarted.promise;
      surviving = runPython(scriptPath, 'surviving_call', [], {
        pythonExecutable: 'configured-python',
      });
      expect(execFileAsync).toHaveBeenCalledTimes(1);
      expect(createSecureTempDirectory).not.toHaveBeenCalled();
      expect(pythonShell).not.toHaveBeenCalled();

      controller.abort(reason);
      validationRelease.resolve({ stdout: 'Python 3.12.0\n', stderr: '' });

      expect(await cancelled).toBe(reason);
      await expect(surviving).resolves.toEqual({ output: 'prepared' });
      expect(createSecureTempDirectory).toHaveBeenCalledTimes(1);
      expect(pythonShell).toHaveBeenCalledTimes(1);
      expect(pythonShell.mock.calls[0][1].args[1]).toBe('surviving_call');
      expect(state.cachedPythonPath).toBe('configured-python');
    } finally {
      validationRelease.resolve({ stdout: 'Python 3.12.0\n', stderr: '' });
      await Promise.allSettled([cancelled, ...(surviving ? [surviving] : [])]);
    }
  });

  it('does not start Python after cancellation during the final preparation write', async () => {
    const outputWritten = deferred<string>();
    const writeRelease = deferred<void>();
    vi.mocked(writeSecureTempFile).mockImplementation(async (directory, filename, contents) => {
      const filePath = await realTempFiles.writeSecureTempFile(directory, filename, contents);
      if (filename === 'output.json') {
        outputWritten.resolve(directory);
        await writeRelease.promise;
      }
      return filePath;
    });
    const controller = new AbortController();
    const reason = { source: 'cancelled while creating Python result file' };
    const options = { pythonExecutable: 'configured-python', abortSignal: controller.signal };
    const pending = runPython(scriptPath, 'call_api', ['input-value'], options).catch(
      (error) => error,
    );

    try {
      const directory = await outputWritten.promise;
      expect(await fs.readFile(path.join(directory, 'input.json'), 'utf8')).toBe('["input-value"]');
      expect(await fs.readFile(path.join(directory, 'output.json'), 'utf8')).toBe('');
      expect(pythonShell).not.toHaveBeenCalled();

      controller.abort(reason);
      writeRelease.resolve();

      expect(await pending).toBe(reason);
      expect(pythonShell).not.toHaveBeenCalled();
      await expect(fs.stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      writeRelease.resolve();
      await pending;
    }
  });

  it.each([false, true])('runs normally with an optional live signal: %s', async (withSignal) => {
    const options = {
      pythonExecutable: 'configured-python',
      ...(withSignal && { abortSignal: new AbortController().signal }),
    };

    await expect(runPython(scriptPath, 'call_api', ['input-value'], options)).resolves.toEqual({
      output: 'prepared',
    });

    expect(pythonShell).toHaveBeenCalledTimes(1);
    expect(pythonShell.mock.calls[0][1]).toMatchObject({ pythonPath: 'configured-python' });
    expect(createdDirectories).toHaveLength(1);
    await expect(fs.stat(createdDirectories[0])).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
