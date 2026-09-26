import { execFile } from 'child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PythonWorker } from '../../src/python/worker';

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

type TestableWorker = {
  process: unknown;
  ready: boolean;
  stopProcess(pythonProcess: unknown): Promise<void>;
};

describe('PythonWorker process termination', () => {
  const originalPlatform = process.platform;

  const setPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  };

  beforeEach(() => {
    // clearAllMocks keeps implementations, and these tests run in random order
    vi.mocked(execFile).mockReset();
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    vi.clearAllMocks();
  });

  const createWorkerWithProcess = () => {
    const worker = new PythonWorker('/scripts/provider.py', 'call_api');
    const kill = vi.fn();
    const end = vi.fn();
    const pythonProcess = {
      childProcess: { pid: 4242, exitCode: null, signalCode: null },
      stdin: { end },
      kill,
    };
    const testable = worker as unknown as TestableWorker;
    testable.process = pythonProcess;
    testable.ready = true;
    return { testable, pythonProcess, kill, end };
  };

  it('should interrupt the process on POSIX so the script can clean up', async () => {
    setPlatform('linux');
    const { testable, pythonProcess, kill, end } = createWorkerWithProcess();

    await testable.stopProcess(pythonProcess);

    expect(end).toHaveBeenCalled();
    expect(kill).toHaveBeenCalledWith('SIGINT');
    expect(execFile).not.toHaveBeenCalled();
  });

  it('should kill the process tree on Windows, where no interrupt is delivered', async () => {
    setPlatform('win32');
    const { testable, pythonProcess, kill } = createWorkerWithProcess();

    await testable.stopProcess(pythonProcess);

    // ChildProcess.kill() terminates outright on Windows whatever signal is named, so the
    // script can't stop its children; taskkill takes the whole tree instead.
    expect(execFile).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '4242', '/t', '/f'],
      expect.any(Function),
    );
    expect(kill).not.toHaveBeenCalled();
  });

  it('should fall back to killing the process when taskkill fails', async () => {
    setPlatform('win32');
    vi.mocked(execFile).mockImplementation(((
      _command: string,
      _args: string[],
      callback: (error: Error | null) => void,
    ) => {
      callback(new Error('taskkill is not available'));
      return undefined;
    }) as unknown as typeof execFile);
    const { testable, pythonProcess, kill } = createWorkerWithProcess();

    await testable.stopProcess(pythonProcess);

    expect(kill).toHaveBeenCalledWith('SIGKILL');
  });
});
