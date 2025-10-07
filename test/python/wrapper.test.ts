import fs from 'fs';

import {
  getSysExecutable,
  runPython,
  state,
  tryPath,
  validatePythonPath,
} from '../../src/python/pythonUtils';
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
    tryPath: jest.fn(),
    getSysExecutable: jest.fn(),
    state: {
      cachedPythonPath: '/usr/bin/python3',
    },
  };
});
interface TestResult {
  testId: number;
  result: string;
}
interface MixedTestResult {
  testId: number;
  result: string;
  isExplicit: boolean;
}
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
  describe('validatePythonPath race conditions', () => {
    let actualPythonUtils: any;

    beforeAll(() => {
      // Get the actual module - we'll use the real validatePythonPath implementation
      // but mock the low-level Python detection functions to avoid actual system calls
      // that can hang on Windows.
      actualPythonUtils = jest.requireActual('../../src/python/pythonUtils');
    });

    beforeEach(() => {
      // Reset the cached path and validation promise before each test
      actualPythonUtils.state.cachedPythonPath = null;
      actualPythonUtils.state.validationPromise = null;

      // Configure the module-level mocks to return a valid Python path
      jest.mocked(tryPath).mockResolvedValue('/usr/bin/python3');
      jest.mocked(getSysExecutable).mockResolvedValue('/usr/bin/python3');
    });
    it('should handle concurrent validatePythonPath calls without race conditions', async () => {
      const { validatePythonPath: realValidatePythonPath, state: realState } = actualPythonUtils;
      // Force cache miss
      realState.cachedPythonPath = null;
      // Launch multiple concurrent validations
      const concurrentCalls = 10;
      const promises = Array.from({ length: concurrentCalls }, (_, i) =>
        realValidatePythonPath('python', false).then(
          (result: string): TestResult => ({ testId: i, result }),
        ),
      );
      const results = await Promise.all(promises);
      // All calls should succeed
      expect(results).toHaveLength(concurrentCalls);
      results.forEach((result: TestResult) => {
        expect(result.result).toBeTruthy();
        expect(typeof result.result).toBe('string');
      });
      // All results should be consistent (no race condition)
      const uniqueResults = new Set(results.map((r: TestResult) => r.result));
      expect(uniqueResults.size).toBe(1);
      // Cache should be populated
      expect(realState.cachedPythonPath).toBeTruthy();
    }, 10000); // Increase timeout for this test
    it('should handle mixed explicit/implicit validation calls consistently', async () => {
      const { validatePythonPath: realValidatePythonPath, state: realState } = actualPythonUtils;
      // Force cache miss
      realState.cachedPythonPath = null;
      // Create mixed explicit/implicit calls
      const mixedPromises = Array.from({ length: 8 }, (_, i) => {
        const isExplicit = i % 2 === 0;
        return realValidatePythonPath('python', isExplicit).then(
          (result: string): MixedTestResult => ({
            testId: i,
            result,
            isExplicit,
          }),
        );
      });
      const results = await Promise.all(mixedPromises);
      // All calls should succeed
      expect(results).toHaveLength(8);
      results.forEach((result: MixedTestResult) => {
        expect(result.result).toBeTruthy();
        expect(typeof result.result).toBe('string');
      });
      // Check consistency between explicit and implicit results
      const explicitResults = results
        .filter((r: MixedTestResult) => r.isExplicit)
        .map((r: MixedTestResult) => r.result);
      const implicitResults = results
        .filter((r: MixedTestResult) => !r.isExplicit)
        .map((r: MixedTestResult) => r.result);
      const uniqueExplicitResults = new Set(explicitResults);
      const uniqueImplicitResults = new Set(implicitResults);
      // Both explicit and implicit calls should return consistent results
      expect(uniqueExplicitResults.size).toBe(1);
      expect(uniqueImplicitResults.size).toBe(1);
      // Explicit and implicit results should be the same
      expect(explicitResults[0]).toBe(implicitResults[0]);
    }, 10000);
    it('should handle rapid successive calls without race conditions', async () => {
      const { validatePythonPath: realValidatePythonPath, state: realState } = actualPythonUtils;
      // Force cache miss
      realState.cachedPythonPath = null;
      // Launch rapid successive calls
      const rapidCalls = 20;
      const promises = Array.from({ length: rapidCalls }, (_, i) =>
        realValidatePythonPath('python', false).then(
          (result: string): TestResult => ({ testId: i, result }),
        ),
      );
      const results = await Promise.all(promises);
      // All calls should succeed
      expect(results).toHaveLength(rapidCalls);
      results.forEach((result: TestResult) => {
        expect(result.result).toBeTruthy();
        expect(typeof result.result).toBe('string');
      });
      // All results should be consistent
      const uniqueResults = new Set(results.map((r: TestResult) => r.result));
      expect(uniqueResults.size).toBe(1);
      // Cache should be populated with the consistent result
      expect(realState.cachedPythonPath).toBe(results[0].result);
    }, 10000);
  });
});
