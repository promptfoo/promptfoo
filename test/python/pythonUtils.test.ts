import { promises as fs } from 'fs';
import { PythonShell } from 'python-shell';
import logger from '../../src/logger';
import {
  runPython,
  validatePythonPath,
  state,
  execAsync,
  tryPath,
} from '../../src/python/pythonUtils';

jest.mock('../../src/esm');
jest.mock('../../src/logger');
jest.mock('python-shell');

jest.mock('../../src/envars', () => ({
  getEnvString: jest.fn(),
}));

jest.mock('../../src/python/pythonUtils', () => {
  const originalModule = jest.requireActual('../../src/python/pythonUtils');
  return {
    ...originalModule,
    execAsync: jest.fn(originalModule.execAsync),
  };
});

describe('pythonUtils', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    delete process.env.PROMPTFOO_PYTHON;
  });

  beforeEach(() => {
    state.cachedPythonPath = null;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('tryPath', () => {
    it('should return null for a non-existent executable', async () => {
      jest.mocked(execAsync).mockRejectedValue(new Error('Command failed'));

      const result = await tryPath('/usr/bin/nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('validatePythonPath', () => {
    it('should validate an existing Python 3 path', async () => {
      jest.mocked(execAsync).mockResolvedValue({ stdout: 'Python 3.8.10\n', stderr: '' });

      const result = await validatePythonPath('python', false);
      expect(result).toBe('python');
      expect(state.cachedPythonPath).toBe('python');
    });

    it('should return the cached path on subsequent calls', async () => {
      state.cachedPythonPath = '/usr/bin/python3';
      const result = await validatePythonPath('python', false);
      expect(result).toBe('/usr/bin/python3');
    });

    it('should fall back to alternative paths for non-existent programs when not explicit', async () => {
      jest
        .mocked(execAsync)
        .mockRejectedValueOnce(new Error('Command failed'))
        .mockResolvedValueOnce({ stdout: 'Python 3.9.5\n', stderr: '' });

      const result = await validatePythonPath('non_existent_program', false);
      expect(result).toBe(process.platform === 'win32' ? 'py -3' : 'python3');
    });

    it('should throw an error for non-existent programs when explicit', async () => {
      jest.mocked(execAsync).mockRejectedValue(new Error('Command failed'));

      await expect(validatePythonPath('non_existent_program', true)).rejects.toThrow(
        'Python 3 not found. Tried "non_existent_program"',
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
