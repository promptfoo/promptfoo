import fs from 'fs';
import { runPython, state, validatePythonPath } from '../../src/python/pythonUtils';
import { runPythonCode } from '../../src/python/wrapper';

jest.mock('../../src/esm');
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
    runPython: jest.fn(originalModule.runPython),
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
    it('should clean up the temporary files after execution', async () => {
      const mockWriteFileSync = jest.fn();
      const mockUnlinkSync = jest.fn();
      const mockRunPython = jest.fn().mockResolvedValue('cleanup test');

      jest.spyOn(fs, 'writeFileSync').mockImplementation(mockWriteFileSync);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(mockUnlinkSync);
      jest.mocked(runPython).mockImplementation(mockRunPython);

      await runPythonCode('print("cleanup test")', 'main', []);

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('temp-python-code-'),
        'print("cleanup test")',
      );
      expect(mockRunPython).toHaveBeenCalledTimes(1);
      expect(mockRunPython).toHaveBeenCalledWith(
        expect.stringContaining('temp-python-code-'),
        'main',
        [],
      );
      expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
      expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('temp-python-code-'));
    });
    it('should execute Python code from a string and read the output file', async () => {
      const mockOutput = { type: 'final_result', data: 'execution result' };

      jest.spyOn(fs, 'writeFileSync').mockReturnValue();
      jest.spyOn(fs, 'unlinkSync').mockReturnValue();

      const mockRunPython = jest.mocked(runPython);
      mockRunPython.mockResolvedValue(mockOutput.data);

      const code = 'print("Hello, world!")';
      const result = await runPythonCode(code, 'main', []);

      expect(result).toBe('execution result');
      expect(mockRunPython).toHaveBeenCalledWith(expect.stringContaining('.py'), 'main', []);
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('.py'), code);
    });
  });
});
