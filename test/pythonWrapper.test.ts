import { promises as fs } from 'fs';
import { PythonShell } from 'python-shell';
import { runPython } from '../src/python/pythonUtils';
import { runPythonCode } from '../src/python/wrapper';

jest.mock('../src/esm');

jest.mock('python-shell');

describe('Python Wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runPython', () => {
    it('should correctly run a Python script with provided arguments', async () => {
      jest.spyOn(fs, 'writeFile').mockResolvedValue();
      jest.spyOn(fs, 'unlink').mockResolvedValue();

      const mockPythonShellRun = jest.mocked(PythonShell.run);
      mockPythonShellRun.mockResolvedValue(['{"type": "final_result", "data": "test result"}']);

      const result = await runPython('testScript.py', 'testMethod', ['arg1', { key: 'value' }]);

      expect(result).toBe('test result');
      expect(mockPythonShellRun).toHaveBeenCalledWith('wrapper.py', expect.any(Object));
      expect(mockPythonShellRun.mock.calls[0][1]!.args).toEqual([
        expect.stringContaining('testScript.py'),
        'testMethod',
        expect.stringContaining('promptfoo-python-input-json'),
      ]);
      expect(fs.unlink).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if the Python script execution fails', async () => {
      const mockPythonShellRun = jest.mocked(PythonShell.run);
      mockPythonShellRun.mockRejectedValue(new Error('Test Error'));

      await expect(runPython('testScript.py', 'testMethod', ['arg1'])).rejects.toThrow(
        'Error running Python script: Test Error',
      );
    });

    it('should handle Python script returning incorrect result type', async () => {
      jest.spyOn(fs, 'writeFile').mockResolvedValue();
      jest.spyOn(fs, 'unlink').mockResolvedValue();

      const mockPythonShellRun = jest.mocked(PythonShell.run);
      mockPythonShellRun.mockResolvedValue([
        '{"type": "unexpected_result", "data": "test result"}',
      ]);

      await expect(runPython('testScript.py', 'testMethod', ['arg1'])).rejects.toThrow(
        'The Python script `call_api` function must return a dict with an `output`',
      );
    });
  });

  describe('runPythonCode', () => {
    it('should execute Python code from a string', async () => {
      const mockPythonShellRun = jest.mocked(PythonShell.run);
      mockPythonShellRun.mockResolvedValue([
        '{"type": "final_result", "data": "execution result"}',
      ]);

      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      const code = 'print("Hello, world!")';
      const result = await runPythonCode(code, 'main', []);

      expect(result).toBe('execution result');
      expect(mockPythonShellRun).toHaveBeenCalledWith('wrapper.py', expect.any(Object));
      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), code);
    });

    it('should clean up the temporary file after execution', async () => {
      jest.spyOn(fs, 'writeFile').mockResolvedValue();
      jest.spyOn(fs, 'unlink').mockResolvedValue();

      await runPythonCode('print("cleanup test")', 'main', []);

      expect(fs.unlink).toHaveBeenCalledTimes(2);
    });
  });
});
