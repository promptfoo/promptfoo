import * as pythonWrapper from '../src/python/wrapper';
import { promises as fs } from 'fs';
import { PythonShell } from 'python-shell';

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

      const mockPythonShellRun = PythonShell.run as jest.Mock;
      mockPythonShellRun.mockResolvedValue(['{"type": "final_result", "data": "test result"}']);

      const result = await pythonWrapper.runPython('testScript.py', 'testMethod', [
        'arg1',
        { key: 'value' },
      ]);

      expect(result).toEqual('test result');
      expect(mockPythonShellRun).toHaveBeenCalledWith('wrapper.py', expect.any(Object));
      expect(mockPythonShellRun.mock.calls[0][1].args).toEqual([
        expect.stringContaining('testScript.py'),
        'testMethod',
        expect.stringContaining('promptfoo-python-input-json'),
      ]);
      expect(fs.unlink).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if the Python script execution fails', async () => {
      const mockPythonShellRun = PythonShell.run as jest.Mock;
      mockPythonShellRun.mockRejectedValue(new Error('Test Error'));

      await expect(
        pythonWrapper.runPython('testScript.py', 'testMethod', ['arg1']),
      ).rejects.toThrow('Error running Python script: Test Error');
    });

    it('should handle Python script returning incorrect result type', async () => {
      jest.spyOn(fs, 'writeFile').mockResolvedValue();
      jest.spyOn(fs, 'unlink').mockResolvedValue();

      const mockPythonShellRun = PythonShell.run as jest.Mock;
      mockPythonShellRun.mockResolvedValue([
        '{"type": "unexpected_result", "data": "test result"}',
      ]);

      await expect(
        pythonWrapper.runPython('testScript.py', 'testMethod', ['arg1']),
      ).rejects.toThrow(
        'The Python script `call_api` function must return a dict with an `output`',
      );
    });
  });

  describe('runPythonCode', () => {
    it('should execute Python code from a string', async () => {
      const mockPythonShellRun = PythonShell.run as jest.Mock;
      mockPythonShellRun.mockResolvedValue([
        '{"type": "final_result", "data": "execution result"}',
      ]);

      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      const code = 'print("Hello, world!")';
      const result = await pythonWrapper.runPythonCode(code, 'main', []);

      expect(result).toEqual('execution result');
      expect(mockPythonShellRun).toHaveBeenCalledWith('wrapper.py', expect.any(Object));
      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), code);
    });

    it('should clean up the temporary file after execution', async () => {
      jest.spyOn(fs, 'writeFile').mockResolvedValue();
      jest.spyOn(fs, 'unlink').mockResolvedValue();

      await pythonWrapper.runPythonCode('print("cleanup test")', 'main', []);

      expect(fs.unlink).toHaveBeenCalledTimes(2);
    });
  });
});
