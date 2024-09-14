import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import { PythonShell } from 'python-shell';
import { runPython, validatePythonPath, state } from '../../src/python/pythonUtils';

jest.mock('../../src/esm');
jest.mock('../../src/logger');
jest.mock('python-shell');
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

describe('pythonUtils', () => {
  beforeAll(() => {
    delete process.env.PROMPTFOO_PYTHON;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runPython', () => {
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
  });

  describe('validatePythonPath', () => {
    let pythonAvailable: boolean = false;

    beforeAll(() => {
      try {
        execSync('python --version', { stdio: 'ignore' });
        pythonAvailable = true;
      } catch {
        pythonAvailable = false;
      }
    });

    beforeEach(() => {
      jest.resetModules();
      state.cachedPythonPath = null;
    });

    it('should validate an existing Python path', async () => {
      if (!pythonAvailable) {
        console.warn('Python not available, skipping test');
        return;
      }
      const result = await validatePythonPath('python');
      expect(result).toMatch(/python/);
    });

    it('should return the cached path on subsequent calls', async () => {
      if (!pythonAvailable) {
        console.warn('Python not available, skipping test');
        return;
      }
      const firstResult = await validatePythonPath('python');
      const secondResult = await validatePythonPath('python');
      expect(firstResult).toBe(secondResult);
    });

    it('should throw an error for a non-existent program', async () => {
      await expect(validatePythonPath('non_existent_program_12345')).rejects.toThrow(
        'Invalid Python path: non_existent_program_12345',
      );
    });
  });
});
