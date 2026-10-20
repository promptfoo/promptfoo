import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPython } from '../../src/python/pythonUtils';
import { runPythonCode } from '../../src/python/wrapper';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from '../../src/util/secureTempFiles';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/util/secureTempFiles', () => ({
  createSecureTempDirectory: vi.fn(),
  removeSecureTempDirectory: vi.fn(),
  writeSecureTempFile: vi.fn(),
}));
vi.mock('../../src/python/pythonUtils', () => ({ runPython: vi.fn() }));
describe('wrapper', () => {
  let restoreEnv: () => void;

  beforeAll(() => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_PYTHON: undefined });
  });

  afterAll(() => {
    restoreEnv();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSecureTempDirectory).mockResolvedValue('/tmp/promptfoo-python-code-test');
    vi.mocked(removeSecureTempDirectory).mockResolvedValue(undefined);
    vi.mocked(writeSecureTempFile).mockImplementation(
      async (directory: string, filename: string) => `${directory}/${filename}`,
    );
  });
  describe('runPythonCode', () => {
    it('should clean up the temporary files after execution', async () => {
      const mockRunPython = vi.fn().mockResolvedValue('cleanup test');
      vi.mocked(runPython).mockImplementation(mockRunPython);
      await runPythonCode('print("cleanup test")', 'main', []);
      expect(createSecureTempDirectory).toHaveBeenCalledWith('promptfoo-python-code-');
      expect(writeSecureTempFile).toHaveBeenCalledWith(
        '/tmp/promptfoo-python-code-test',
        'script.py',
        'print("cleanup test")',
      );
      expect(mockRunPython).toHaveBeenCalledTimes(1);
      expect(mockRunPython).toHaveBeenCalledWith(
        '/tmp/promptfoo-python-code-test/script.py',
        'main',
        [],
      );
      expect(removeSecureTempDirectory).toHaveBeenCalledWith('/tmp/promptfoo-python-code-test');
    });
    it('should execute Python code from a string and read the output file', async () => {
      const mockOutput = { type: 'final_result', data: 'execution result' };
      const mockRunPython = vi.mocked(runPython);
      mockRunPython.mockResolvedValue(mockOutput.data);
      const code = 'print("Hello, world!")';
      const result = await runPythonCode(code, 'main', []);
      expect(result).toBe('execution result');
      expect(mockRunPython).toHaveBeenCalledWith(expect.stringContaining('.py'), 'main', []);
      expect(writeSecureTempFile).toHaveBeenCalledWith(
        '/tmp/promptfoo-python-code-test',
        'script.py',
        code,
      );
    });
  });
});
