import { promises as fs } from 'fs';
import { PythonShell } from 'python-shell';
import { runPythonCode } from '../../src/python/wrapper';

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

describe('wrapper', () => {
  beforeAll(() => {
    delete process.env.PROMPTFOO_PYTHON;
  });

  beforeEach(() => {
    jest.clearAllMocks();
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
