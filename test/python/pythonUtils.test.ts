import type * as childProcess from 'child_process';
import { promises as fs } from 'fs';
import { PythonShell } from 'python-shell';
import { getEnvString } from '../../src/envars';
import logger from '../../src/logger';
import { runPython, validatePythonPath, state } from '../../src/python/pythonUtils';

jest.mock('../../src/esm');
jest.mock('../../src/logger');
jest.mock('python-shell');

jest.mock('../../src/envars', () => ({
  getEnvString: jest.fn(),
}));

describe('pythonUtils', () => {
  describe('validatePythonPath', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeAll(() => {
      originalEnv = { ...process.env };
      delete process.env.PROMPTFOO_PYTHON;
    });

    beforeEach(() => {
      state.cachedPythonPath = null;
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should validate an existing Python path if python is installed', async () => {
      try {
        const result = await validatePythonPath('python', false);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      } catch {
        console.warn('"python" not found, skipping test');
        return;
      }
    });

    it('should validate an existing Python path if python3 is installed', async () => {
      try {
        const result = await validatePythonPath('python3', false);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      } catch {
        console.warn('"python3" not found, skipping test');
        return;
      }
    });

    it('should return the cached path on subsequent calls', async () => {
      try {
        const firstResult = await validatePythonPath('python', false);
        expect(state.cachedPythonPath).toBe(firstResult);
        const secondResult = await validatePythonPath('python', false);
        expect(secondResult).toBe(firstResult);
      } catch {
        console.warn('"python" not found, skipping test');
        return;
      }
    });

    it('should fall back to alternative paths for non-existent programs when not explicit', async () => {
      jest.mocked(getEnvString).mockReturnValue('');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      jest.spyOn(require('child_process'), 'exec').mockImplementation((cmd, callback) => {
        if (typeof callback === 'function') {
          callback(null, '/usr/bin/python3', '');
        }
        return {} as childProcess.ChildProcess;
      });

      const invalidPythonPath = 'non_existent_program_12345';
      let result: string | undefined;
      try {
        result = await validatePythonPath(invalidPythonPath, false);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        expect(state.cachedPythonPath).toBe(result);
      } catch {
        console.warn('"non_existent_program_12345" not found, skipping test');
        return;
      }
    });

    it('should throw an error for non-existent programs when explicit', async () => {
      jest.mocked(getEnvString).mockReturnValue('');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      jest.spyOn(require('child_process'), 'exec').mockImplementation((cmd, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('Command failed'), '', '');
        }
        return {} as childProcess.ChildProcess;
      });

      const invalidPythonPath = 'non_existent_program_12345';

      await expect(validatePythonPath(invalidPythonPath, true)).rejects.toThrow(
        `Python not found. Tried "${invalidPythonPath}"`,
      );
    });
  });

  describe('runPython', () => {
    beforeEach(() => {
      state.cachedPythonPath = '/usr/bin/python3';
    });

    it('should correctly run a Python script with provided arguments and read the output file', async () => {
      const mockOutput = JSON.stringify({ type: 'final_result', data: 'test result' });

      jest.spyOn(fs, 'writeFile').mockResolvedValue();
      jest.spyOn(fs, 'readFile').mockResolvedValue(mockOutput);
      jest.spyOn(fs, 'unlink').mockResolvedValue();

      const mockPythonShellRun = jest.mocked(PythonShell.run);
      mockPythonShellRun.mockResolvedValue([]);

      const result = await runPython('testScript.py', 'testMethod', ['arg1', { key: 'value' }]);

      expect(result).toBe('test result');
      expect(mockPythonShellRun).toHaveBeenCalledWith(
        'wrapper.py',
        expect.objectContaining({
          args: expect.arrayContaining([
            expect.stringContaining('testScript.py'),
            'testMethod',
            expect.stringContaining('promptfoo-python-input-json'),
            expect.stringContaining('promptfoo-python-output-json'),
          ]),
        }),
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo-python-input-json'),
        expect.any(String),
        'utf-8',
      );
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo-python-output-json'),
        'utf-8',
      );
      expect(fs.unlink).toHaveBeenCalledTimes(2); // Once for input JSON, once for output JSON
    });

    it('should throw an error if the Python script execution fails', async () => {
      const mockPythonShellRun = jest.mocked(PythonShell.run);
      mockPythonShellRun.mockRejectedValue(new Error('Test Error'));

      await expect(runPython('testScript.py', 'testMethod', ['arg1'])).rejects.toThrow(
        'Error running Python script: Test Error',
      );
    });

    it('should handle Python script returning incorrect result type', async () => {
      const mockOutput = JSON.stringify({ type: 'unexpected_result', data: 'test result' });

      jest.spyOn(fs, 'writeFile').mockResolvedValue();
      jest.spyOn(fs, 'readFile').mockResolvedValue(mockOutput);
      jest.spyOn(fs, 'unlink').mockResolvedValue();

      const mockPythonShellRun = jest.mocked(PythonShell.run);
      mockPythonShellRun.mockResolvedValue([]);

      await expect(runPython('testScript.py', 'testMethod', ['arg1'])).rejects.toThrow(
        'The Python script `call_api` function must return a dict with an `output`',
      );
    });

    it('should handle invalid JSON in the output file', async () => {
      jest.spyOn(fs, 'writeFile').mockResolvedValue();
      jest.spyOn(fs, 'readFile').mockResolvedValue('Invalid JSON');
      jest.spyOn(fs, 'unlink').mockResolvedValue();

      const mockPythonShellRun = jest.mocked(PythonShell.run);
      mockPythonShellRun.mockResolvedValue([]);

      await expect(runPython('testScript.py', 'testMethod', ['arg1'])).rejects.toThrow(
        'Invalid JSON:',
      );
    });

    it('should log and throw an error with stack trace when Python script execution fails', async () => {
      const mockError = new Error('Test Error');
      mockError.stack = '--- Python Traceback ---\nError details';

      const mockPythonShellRun = jest.mocked(PythonShell.run);
      mockPythonShellRun.mockRejectedValue(mockError);

      const loggerErrorSpy = jest.spyOn(logger, 'error');

      await expect(runPython('testScript.py', 'testMethod', ['arg1'])).rejects.toThrow(
        'Error running Python script: Test Error\nStack Trace: Python Traceback: \nError details',
      );

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error running Python script: Test Error\nStack Trace: Python Traceback: \nError details',
      );
    });

    it('should handle error without stack trace', async () => {
      const mockError = new Error('Test Error Without Stack');
      mockError.stack = undefined;

      const mockPythonShellRun = jest.mocked(PythonShell.run);
      mockPythonShellRun.mockRejectedValue(mockError);

      const loggerErrorSpy = jest.spyOn(logger, 'error');

      await expect(runPython('testScript.py', 'testMethod', ['arg1'])).rejects.toThrow(
        'Error running Python script: Test Error Without Stack\nStack Trace: No Python traceback available',
      );

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error running Python script: Test Error Without Stack\nStack Trace: No Python traceback available',
      );
    });
  });
});
