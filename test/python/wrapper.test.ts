import fs from 'fs';
import { PythonShell } from 'python-shell';
import { state, validatePythonPath } from '../../src/python/pythonUtils';
import { runPythonCode } from '../../src/python/wrapper';

jest.mock('../../src/esm');
jest.mock('../../src/logger');
jest.mock('python-shell');
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));
jest.mock('../../src/python/pythonUtils', () => {
  const originalModule = jest.requireActual('../../src/python/pythonUtils');
  return {
    ...originalModule,
    validatePythonPath: jest.fn(),
    state: {
      cachedPythonPath: '/usr/bin/python3',
    },
  };
});

describe('wrapper', () => {
  beforeAll(() => {
    delete process.env.PROMPTFOO_PYTHON;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(validatePythonPath)
      .mockImplementation((pythonPath: string, isExplicit: boolean): Promise<string> => {
        state.cachedPythonPath = pythonPath;
        return Promise.resolve(pythonPath);
      });
  });

  describe('runPythonCode', () => {
    it('should execute Python code from a string and read the output file', async () => {
      const mockOutput = JSON.stringify({ type: 'final_result', data: 'execution result' });

      jest.spyOn(fs, 'writeFileSync').mockReturnValue();
      jest.spyOn(fs, 'readFileSync').mockReturnValue(mockOutput);
      jest.spyOn(fs, 'unlinkSync').mockReturnValue();

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
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('.py'), code);
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo-python-output-json'),
        'utf-8',
      );
    });

    it('should clean up the temporary files after execution', async () => {
      jest.spyOn(fs, 'writeFileSync').mockReturnValue();
      jest
        .spyOn(fs, 'readFileSync')
        .mockReturnValue('{"type": "final_result", "data": "cleanup test"}');
      jest.spyOn(fs, 'unlinkSync').mockReturnValue();

      await runPythonCode('print("cleanup test")', 'main', []);

      expect(fs.unlinkSync).toHaveBeenCalledTimes(3); // Once for the temporary Python file, once for input JSON, once for output JSON
    });
  });
});
