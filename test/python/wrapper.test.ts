import fs from 'fs';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSysExecutable,
  runPython,
  state,
  tryPath,
  validatePythonPath,
} from '../../src/python/pythonUtils';
import { runPythonCode } from '../../src/python/wrapper';

vi.mock('../../src/esm');
vi.mock('python-shell');
vi.mock('fs', () => {
  const fsMock = {
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
  return {
    ...fsMock,
    default: fsMock,
  };
});
vi.mock('../../src/python/pythonUtils', async () => {
  const originalModule = await vi.importActual<typeof import('../../src/python/pythonUtils')>(
    '../../src/python/pythonUtils',
  );
  return {
    ...originalModule,
    validatePythonPath: vi.fn(),
    runPython: vi.fn(originalModule.runPython),
    tryPath: vi.fn(),
    getSysExecutable: vi.fn(),
    // Use the real state object so all implementations share the same cache
    state: originalModule.state,
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
    vi.clearAllMocks();
    vi.mocked(validatePythonPath).mockImplementation(
      (pythonPath: string, _isExplicit: boolean): Promise<string> => {
        state.cachedPythonPath = pythonPath;
        return Promise.resolve(pythonPath);
      },
    );
  });
  describe('runPythonCode', () => {
    it('should clean up the temporary files after execution', async () => {
      const mockWriteFileSync = vi.fn();
      const mockUnlinkSync = vi.fn();
      const mockRunPython = vi.fn().mockResolvedValue('cleanup test');
      vi.spyOn(fs, 'writeFileSync').mockImplementation(mockWriteFileSync);
      vi.spyOn(fs, 'unlinkSync').mockImplementation(mockUnlinkSync);
      vi.mocked(runPython).mockImplementation(mockRunPython);
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
      vi.spyOn(fs, 'writeFileSync').mockReturnValue();
      vi.spyOn(fs, 'unlinkSync').mockReturnValue();
      const mockRunPython = vi.mocked(runPython);
      mockRunPython.mockResolvedValue(mockOutput.data);
      const code = 'print("Hello, world!")';
      const result = await runPythonCode(code, 'main', []);
      expect(result).toBe('execution result');
      expect(mockRunPython).toHaveBeenCalledWith(expect.stringContaining('.py'), 'main', []);
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('.py'), code);
    });
  });
  describe('validatePythonPath race conditions', () => {
    beforeAll(async () => {
      // Restore the real validatePythonPath implementation while keeping
      // tryPath and getSysExecutable mocked to avoid actual system calls
      const realModule = await vi.importActual<typeof import('../../src/python/pythonUtils')>(
        '../../src/python/pythonUtils',
      );
      vi.mocked(validatePythonPath).mockImplementation(realModule.validatePythonPath);
    });

    beforeEach(() => {
      // Reset the cached path and validation promise before each test
      state.cachedPythonPath = null;
      state.validationPromise = null;

      // Configure the module-level mocks with realistic delays to simulate Windows behavior
      // This is critical for testing race conditions that only appear under slow I/O
      vi.mocked(tryPath).mockImplementation(async (_path: string) => {
        // Simulate slow Windows process spawning and antivirus scanning
        await new Promise((resolve) => setTimeout(resolve, 50));
        return '/usr/bin/python3';
      });
      vi.mocked(getSysExecutable).mockImplementation(async () => {
        // Simulate slow Windows 'where' command and py launcher
        await new Promise((resolve) => setTimeout(resolve, 100));
        return '/usr/bin/python3';
      });
    });
    it('should handle concurrent validatePythonPath calls without race conditions', async () => {
      // Launch multiple concurrent validations
      const concurrentCalls = 10;
      const promises = Array.from({ length: concurrentCalls }, (_, i) =>
        validatePythonPath('python', false).then(
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
      // If there was a race condition, different calls might get different results
      const uniqueResults = new Set(results.map((r: TestResult) => r.result));
      expect(uniqueResults.size).toBe(1);
      // Cache should be populated
      expect(state.cachedPythonPath).toBeTruthy();
    }, 10000); // Increase timeout for this test
    it('should handle mixed explicit/implicit validation calls consistently', async () => {
      // Create mixed explicit/implicit calls
      const mixedPromises = Array.from({ length: 8 }, (_, i) => {
        const isExplicit = i % 2 === 0;
        return validatePythonPath('python', isExplicit).then(
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
      // If there was a race condition, explicit and implicit calls might return different results
      expect(uniqueExplicitResults.size).toBe(1);
      expect(uniqueImplicitResults.size).toBe(1);
      // Explicit and implicit results should be the same
      expect(explicitResults[0]).toBe(implicitResults[0]);
    }, 10000);
    it('should handle rapid successive calls without race conditions', async () => {
      // Launch rapid successive calls
      const rapidCalls = 20;
      const promises = Array.from({ length: rapidCalls }, (_, i) =>
        validatePythonPath('python', false).then(
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
      // If there was a race condition, different calls could get different cached values
      const uniqueResults = new Set(results.map((r: TestResult) => r.result));
      expect(uniqueResults.size).toBe(1);
      // Cache should be populated with the consistent result
      expect(state.cachedPythonPath).toBe(results[0].result);
    }, 10000);
  });
});
