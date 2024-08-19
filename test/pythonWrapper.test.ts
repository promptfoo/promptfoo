import { promises as fs } from 'fs';
import { PythonShell } from 'python-shell';
import { runPython } from '../src/python/pythonUtils';
import { runPythonCode } from '../src/python/wrapper';

jest.mock('../src/esm');
jest.mock('../src/logger');
jest.mock('python-shell');
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

describe('Python Wrapper', () => {
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

  describe('runPythonCode', () => {
    it('should execute Python code from a string and read the output file', async () => {
      const mockOutput = JSON.stringify({ type: 'final_result', data: 'execution result' });

      jest.spyOn(fs, 'writeFile').mockResolvedValue();
      jest.spyOn(fs, 'readFile').mockResolvedValue(mockOutput);
      jest.spyOn(fs, 'unlink').mockResolvedValue();

      const mockPythonShellRun = jest.mocked(PythonShell.run);
      mockPythonShellRun.mockResolvedValue([]);

      const code = 'print("Hello, world!")';
      const result = await runPythonCode(code, 'main', []);

      expect(result).toBe('execution result');
      expect(mockPythonShellRun).toHaveBeenCalledWith(
        'wrapper.py',
        expect.objectContaining({
          args: expect.arrayContaining([
            expect.stringContaining('.py'),
            'main',
            expect.stringContaining('promptfoo-python-input-json'),
            expect.stringContaining('promptfoo-python-output-json'),
          ]),
        }),
      );
      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), code);
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo-python-output-json'),
        'utf-8',
      );
    });

    it('should clean up the temporary files after execution', async () => {
      jest.spyOn(fs, 'writeFile').mockResolvedValue();
      jest
        .spyOn(fs, 'readFile')
        .mockResolvedValue('{"type": "final_result", "data": "cleanup test"}');
      jest.spyOn(fs, 'unlink').mockResolvedValue();

      await runPythonCode('print("cleanup test")', 'main', []);

      expect(fs.unlink).toHaveBeenCalledTimes(3); // Once for the temporary Python file, once for input JSON, once for output JSON
    });
  });
});
