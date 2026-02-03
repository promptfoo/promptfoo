import fs from 'fs';
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Create mock for execFileAsync - must be hoisted for vi.mock factory
const { mockExecFileAsync, mockExecFile } = vi.hoisted(() => {
  const mockExecFileAsync = vi.fn();
  // Create a mock execFile with the custom promisify symbol
  const mockExecFile = Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: mockExecFileAsync,
  });
  return { mockExecFileAsync, mockExecFile };
});

// Mock child_process.execFile with custom promisify support
vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

import { PythonShell } from 'python-shell';
import { getEnvBool, getEnvString } from '../../src/envars';
import * as pythonUtils from '../../src/python/pythonUtils';

// Mock setup
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

vi.mock('../../src/envars', () => ({
  getEnvString: vi.fn(),
  getEnvBool: vi.fn(),
}));

// Must be hoisted for vi.mock factory
const { mockPythonShellInstance, MockPythonShell } = vi.hoisted(() => {
  const instance = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    end: vi.fn(),
  };
  // Create a proper class that can be used with 'new'
  const MockPythonShell = vi.fn(function (this: typeof instance) {
    Object.assign(this, instance);
    return this;
  }) as unknown as typeof import('python-shell').PythonShell;
  return { mockPythonShellInstance: instance, MockPythonShell };
});

vi.mock('python-shell', () => ({
  PythonShell: MockPythonShell,
}));

describe('Python Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFileAsync.mockReset();
    pythonUtils.state.cachedPythonPath = null;
    pythonUtils.state.validationPromise = null;
    // Set default mock return values
    vi.mocked(getEnvString).mockReturnValue('');
    vi.mocked(getEnvBool).mockReturnValue(false);
  });

  describe('getConfiguredPythonPath', () => {
    it('should return explicit config path when provided', () => {
      const result = pythonUtils.getConfiguredPythonPath('/custom/python/path');
      expect(result).toBe('/custom/python/path');
    });

    it('should return PROMPTFOO_PYTHON when config path is not provided', () => {
      vi.mocked(getEnvString).mockReturnValue('/env/python/path');

      const result = pythonUtils.getConfiguredPythonPath(undefined);

      expect(result).toBe('/env/python/path');
      expect(getEnvString).toHaveBeenCalledWith('PROMPTFOO_PYTHON');
    });

    it('should prioritize config path over PROMPTFOO_PYTHON', () => {
      vi.mocked(getEnvString).mockReturnValue('/env/python/path');

      const result = pythonUtils.getConfiguredPythonPath('/config/python/path');

      expect(result).toBe('/config/python/path');
    });

    it('should return undefined when neither config nor env var is set', () => {
      vi.mocked(getEnvString).mockReturnValue('');

      const result = pythonUtils.getConfiguredPythonPath(undefined);

      expect(result).toBeUndefined();
    });

    it('should return undefined when config is empty string and env var is not set', () => {
      vi.mocked(getEnvString).mockReturnValue('');

      const result = pythonUtils.getConfiguredPythonPath('');

      expect(result).toBeUndefined();
    });

    it('should return PROMPTFOO_PYTHON when config is empty string', () => {
      vi.mocked(getEnvString).mockReturnValue('/env/python');

      const result = pythonUtils.getConfiguredPythonPath('');

      expect(result).toBe('/env/python');
    });
  });

  describe('getSysExecutable', () => {
    it('should return Python executable path from sys.executable', async () => {
      // Mock for Unix-like systems (not Windows)
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      mockExecFileAsync.mockResolvedValue({ stdout: '/usr/bin/python3.8\n', stderr: '' });

      const result = await pythonUtils.getSysExecutable();

      expect(result).toBe('/usr/bin/python3.8');
      expect(mockExecFileAsync).toHaveBeenCalledWith('python3', [
        '-c',
        'import sys; print(sys.executable)',
      ]);

      // Restore original platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should use Windows where command first on Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      let callCount = 0;
      mockExecFileAsync.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // 'where python' returns multiple paths
          return {
            stdout:
              'C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe\nC:\\Python39\\python.exe\n',
            stderr: '',
          };
        } else {
          // Version check succeeds
          return { stdout: 'Python 3.9.0\n', stderr: '' };
        }
      });

      const result = await pythonUtils.getSysExecutable();

      // Should skip WindowsApps and use the real Python installation
      expect(result).toBe('C:\\Python39\\python.exe');
      expect(mockExecFileAsync).toHaveBeenCalledWith('where', ['python']);
      // Verify that the non-WindowsApps path was validated
      expect(mockExecFileAsync).toHaveBeenCalledWith('C:\\Python39\\python.exe', ['--version']);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should fall back to py commands if Windows where fails', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      let callCount = 0;
      mockExecFileAsync.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // 'where python' fails
          throw new Error('where command failed');
        } else {
          // 'py' sys.executable succeeds
          return { stdout: 'C:\\Python39\\python.exe\n', stderr: '' };
        }
      });

      const result = await pythonUtils.getSysExecutable();

      expect(result).toBe('C:\\Python39\\python.exe');
      expect(mockExecFileAsync).toHaveBeenCalledWith('where', ['python']);
      // Verify py launcher fallback was used
      expect(mockExecFileAsync).toHaveBeenCalledWith('py', [
        '-c',
        'import sys; print(sys.executable)',
      ]);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should try direct python command as final Windows fallback', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      let callCount = 0;
      mockExecFileAsync.mockImplementation(async () => {
        callCount++;
        if (callCount <= 3) {
          // First 3 calls fail
          throw new Error('failed');
        } else {
          // Final fallback succeeds
          return { stdout: 'Python 3.9.0\n', stderr: '' };
        }
      });

      const result = await pythonUtils.getSysExecutable();

      expect(result).toBe('python');
      expect(mockExecFileAsync).toHaveBeenCalledWith('where', ['python']);
      // Verify the final fallback python --version was called
      expect(mockExecFileAsync).toHaveBeenCalledWith('python', ['--version']);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should add .exe suffix on Windows if missing', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      let callCount = 0;
      mockExecFileAsync.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('where failed');
        } else {
          return { stdout: 'C:\\Python39\\python\n', stderr: '' };
        }
      });

      const result = await pythonUtils.getSysExecutable();

      expect(result).toBe('C:\\Python39\\python.exe');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should handle empty where output gracefully', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      let callCount = 0;
      mockExecFileAsync.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // 'where python' returns empty
          return { stdout: '', stderr: '' };
        } else {
          // 'py' succeeds
          return { stdout: 'C:\\Python39\\python.exe\n', stderr: '' };
        }
      });

      const result = await pythonUtils.getSysExecutable();

      expect(result).toBe('C:\\Python39\\python.exe');
      expect(mockExecFileAsync).toHaveBeenCalledWith('where', ['python']);
      // Verify py launcher fallback was used when where returned empty
      expect(mockExecFileAsync).toHaveBeenCalledWith('py', [
        '-c',
        'import sys; print(sys.executable)',
      ]);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return null if no Python executable is found', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('Command failed'));

      const result = await pythonUtils.getSysExecutable();

      expect(result).toBeNull();
    });
  });

  describe('tryPath', () => {
    describe('successful path validation', () => {
      it('should return the path for a valid Python 3 executable', async () => {
        mockExecFileAsync.mockResolvedValue({ stdout: 'Python 3.8.10\n', stderr: '' });

        const result = await pythonUtils.tryPath('/usr/bin/python3');

        expect(result).toBe('/usr/bin/python3');
        expect(mockExecFileAsync).toHaveBeenCalledWith('/usr/bin/python3', ['--version']);
      });
    });

    describe('failed path validation', () => {
      it('should return null for a non-existent executable', async () => {
        mockExecFileAsync.mockRejectedValue(new Error('Command failed'));

        const result = await pythonUtils.tryPath('/usr/bin/nonexistent');

        expect(result).toBeNull();
        expect(mockExecFileAsync).toHaveBeenCalledWith('/usr/bin/nonexistent', ['--version']);
      });

      it('should return null if the command times out', async () => {
        vi.useFakeTimers();

        // Mock execFileAsync to return a promise that never resolves (simulating timeout)
        mockExecFileAsync.mockImplementation(() => new Promise(() => {}));

        const resultPromise = pythonUtils.tryPath('/usr/bin/python3');
        await vi.advanceTimersByTimeAsync(2501);

        const result = await resultPromise;

        expect(result).toBeNull();
        expect(mockExecFileAsync).toHaveBeenCalledWith('/usr/bin/python3', ['--version']);
        vi.useRealTimers();
      });
    });
  });

  describe('validatePythonPath', () => {
    describe('caching behavior', () => {
      it('should validate and cache an existing Python 3 path', async () => {
        mockExecFileAsync.mockResolvedValue({ stdout: 'Python 3.8.10\n', stderr: '' });

        const result = await pythonUtils.validatePythonPath('python', false);

        expect(result).toBe('python');
        expect(pythonUtils.state.cachedPythonPath).toBe('python');
        expect(mockExecFileAsync).toHaveBeenCalledWith('python', ['--version']);
      });

      it('should return the cached path on subsequent calls', async () => {
        pythonUtils.state.cachedPythonPath = '/usr/bin/python3';

        const result = await pythonUtils.validatePythonPath('python', false);

        expect(result).toBe('/usr/bin/python3');
        expect(mockExecFileAsync).not.toHaveBeenCalled();
      });
    });

    describe('fallback behavior', () => {
      it('should fall back to alternative paths for non-existent programs when not explicit', async () => {
        mockExecFileAsync.mockReset();
        let callCount = 0;

        mockExecFileAsync.mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            // Primary path fails
            throw new Error('Command failed');
          } else if (process.platform === 'win32') {
            if (callCount <= 4) {
              throw new Error('Command failed');
            } else {
              return { stdout: 'Python 3.9.5\n', stderr: '' };
            }
          } else {
            // Unix: getSysExecutable succeeds on python3
            return { stdout: '/usr/bin/python3\n', stderr: '' };
          }
        });

        const result = await pythonUtils.validatePythonPath('non_existent_program', false);

        expect(result).toBe(process.platform === 'win32' ? 'python' : '/usr/bin/python3');
      });

      it('should throw an error for non-existent programs when explicit', async () => {
        mockExecFileAsync.mockRejectedValue(new Error('Command failed'));

        await expect(pythonUtils.validatePythonPath('non_existent_program', true)).rejects.toThrow(
          'Python 3 not found. Tried "non_existent_program"',
        );
        expect(mockExecFileAsync).toHaveBeenCalledWith('non_existent_program', ['--version']);
      });

      it('should throw an error when no valid Python path is found', async () => {
        mockExecFileAsync.mockReset();
        mockExecFileAsync.mockRejectedValue(new Error('Command failed'));

        await expect(pythonUtils.validatePythonPath('python', false)).rejects.toThrow(
          'Python 3 not found. Tried "python", sys.executable detection, and fallback commands.',
        );
        expect(mockExecFileAsync).toHaveBeenCalled();
      });
    });

    describe('environment variable handling', () => {
      it('should use PROMPTFOO_PYTHON environment variable when provided', async () => {
        vi.mocked(getEnvString).mockReturnValue('/custom/python/path');
        mockExecFileAsync.mockResolvedValue({ stdout: 'Python 3.8.10\n', stderr: '' });

        const result = await pythonUtils.validatePythonPath('/custom/python/path', true);

        expect(result).toBe('/custom/python/path');
        expect(mockExecFileAsync).toHaveBeenCalledWith('/custom/python/path', ['--version']);
      });
    });

    describe('concurrent validation', () => {
      it('should share validation promise between concurrent calls', async () => {
        mockExecFileAsync.mockImplementation(async () => {
          // Add delay to simulate slow execution
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { stdout: 'Python 3.8.10\n', stderr: '' };
        });

        // Start two validations concurrently
        const [result1, result2] = await Promise.all([
          pythonUtils.validatePythonPath('python', false),
          pythonUtils.validatePythonPath('python', false),
        ]);

        expect(result1).toBe('python');
        expect(result2).toBe('python');

        // Only one exec call should be made
        expect(mockExecFileAsync).toHaveBeenCalledTimes(1);

        // After resolution, validation promise should be cleared
        expect(pythonUtils.state.validationPromise).toBeNull();
      });

      it('should handle race conditions between concurrent validation attempts', async () => {
        // Clear cached path first to ensure validation runs
        pythonUtils.state.cachedPythonPath = null;

        mockExecFileAsync.mockImplementation(async () => {
          // Delay to simulate slow execution
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { stdout: 'Python 3.8.10\n', stderr: '' };
        });

        // Start multiple validations without waiting
        const promises = [
          pythonUtils.validatePythonPath('python', false),
          pythonUtils.validatePythonPath('python', false),
          pythonUtils.validatePythonPath('python', false),
        ];

        const results = await Promise.all(promises);

        expect(results).toEqual(['python', 'python', 'python']);

        // Only one exec call should be made
        expect(mockExecFileAsync).toHaveBeenCalledTimes(1);

        // After resolution, validation promise should be cleared
        expect(pythonUtils.state.validationPromise).toBeNull();
      });
    });

    describe('promise cleanup', () => {
      it('should clear validation promise after failed validation', async () => {
        mockExecFileAsync.mockRejectedValue(new Error('Command failed'));

        await expect(pythonUtils.validatePythonPath('python', true)).rejects.toThrow(
          'Python 3 not found. Tried "python"',
        );

        // Validation promise should be cleared even after failure
        expect(pythonUtils.state.validationPromise).toBeNull();
      });
    });
  });

  describe('runPython', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should execute a Python script with proper arguments', async () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ type: 'final_result', data: 42 }),
      );
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});
      mockExecFileAsync.mockResolvedValue({ stdout: 'Python 3.8.10\n', stderr: '' });

      mockPythonShellInstance.end.mockImplementation((callback: any) => {
        callback(null);
      });

      const scriptPath = '/path/to/script.py';
      const result = await pythonUtils.runPython(scriptPath, 'test_method', [1, 2, 3]);

      expect(result).toBe(42);
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(PythonShell).toHaveBeenCalledWith(
        'wrapper.py',
        expect.objectContaining({
          scriptPath: expect.any(String),
          args: expect.arrayContaining([path.resolve(scriptPath), 'test_method']),
        }),
      );
    });

    it('should use python subdirectory for wrapper.py scriptPath', async () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ type: 'final_result', data: 'test_result' }),
      );
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});
      mockExecFileAsync.mockResolvedValue({ stdout: 'Python 3.8.10\n', stderr: '' });

      mockPythonShellInstance.end.mockImplementation((callback: any) => {
        callback(null);
      });

      const scriptPath = '/path/to/script.py';
      await pythonUtils.runPython(scriptPath, 'test_method', ['arg1', 'arg2']);

      // Verify PythonShell was called with scriptPath ending in 'python'
      // This works for both development (src/python/) and production (dist/src/python/)
      expect(PythonShell).toHaveBeenCalledWith(
        'wrapper.py',
        expect.objectContaining({
          scriptPath: expect.stringMatching(/python$/),
        }),
      );
    });

    it('should throw an error if Python script returns invalid JSON', async () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});
      mockExecFileAsync.mockResolvedValue({ stdout: 'Python 3.8.10\n', stderr: '' });

      mockPythonShellInstance.end.mockImplementation((callback: any) => {
        callback(null);
      });

      await expect(pythonUtils.runPython('/path/to/script.py', 'test_method', [])).rejects.toThrow(
        'Invalid JSON',
      );
    });

    it('should throw an error if Python script does not return final_result', async () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ type: 'other', data: 42 }));
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});
      mockExecFileAsync.mockResolvedValue({ stdout: 'Python 3.8.10\n', stderr: '' });

      mockPythonShellInstance.end.mockImplementation((callback: any) => {
        callback(null);
      });

      await expect(pythonUtils.runPython('/path/to/script.py', 'test_method', [])).rejects.toThrow(
        'The Python script `call_api` function must return a dict with an `output`',
      );
    });

    it('should clean up temporary files even on error', async () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read failed');
      });
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});
      mockExecFileAsync.mockResolvedValue({ stdout: 'Python 3.8.10\n', stderr: '' });

      mockPythonShellInstance.end.mockImplementation((callback: any) => {
        callback(null);
      });

      await expect(
        pythonUtils.runPython('/path/to/script.py', 'test_method', []),
      ).rejects.toThrow();

      // Should attempt to clean up both temp files
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('handlePythonLogMessage', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('parses and routes a valid info-level log message', () => {
      const line = JSON.stringify({
        marker: '__PROMPTFOO_LOG__',
        version: 1,
        level: 'info',
        message: 'test info message',
      });
      const result = pythonUtils.handlePythonLogMessage(line);
      expect(result).toBe(true);
    });

    it('parses and routes a valid debug-level log message', () => {
      const line = JSON.stringify({
        marker: '__PROMPTFOO_LOG__',
        version: 1,
        level: 'debug',
        message: 'test debug message',
      });
      const result = pythonUtils.handlePythonLogMessage(line);
      expect(result).toBe(true);
    });

    it('parses and routes a valid warn-level log message', () => {
      const line = JSON.stringify({
        marker: '__PROMPTFOO_LOG__',
        version: 1,
        level: 'warn',
        message: 'test warn message',
      });
      const result = pythonUtils.handlePythonLogMessage(line);
      expect(result).toBe(true);
    });

    it('parses and routes a valid error-level log message', () => {
      const line = JSON.stringify({
        marker: '__PROMPTFOO_LOG__',
        version: 1,
        level: 'error',
        message: 'test error message',
      });
      const result = pythonUtils.handlePythonLogMessage(line);
      expect(result).toBe(true);
    });

    it('handles version 0 messages (no version field)', () => {
      const line = JSON.stringify({
        marker: '__PROMPTFOO_LOG__',
        level: 'info',
        message: 'legacy message',
      });
      const result = pythonUtils.handlePythonLogMessage(line);
      expect(result).toBe(true);
    });

    it('includes structured data in log output', () => {
      const line = JSON.stringify({
        marker: '__PROMPTFOO_LOG__',
        version: 1,
        level: 'info',
        message: 'with data',
        data: { source: 'test', count: 42 },
      });
      const result = pythonUtils.handlePythonLogMessage(line);
      expect(result).toBe(true);
    });

    it('returns false for non-JSON input', () => {
      const result = pythonUtils.handlePythonLogMessage('plain text output');
      expect(result).toBe(false);
    });

    it('returns false for JSON without the log marker', () => {
      const line = JSON.stringify({ level: 'info', message: 'no marker' });
      const result = pythonUtils.handlePythonLogMessage(line);
      expect(result).toBe(false);
    });

    it('returns false for JSON with wrong marker', () => {
      const line = JSON.stringify({
        marker: 'WRONG_MARKER',
        level: 'info',
        message: 'wrong marker',
      });
      const result = pythonUtils.handlePythonLogMessage(line);
      expect(result).toBe(false);
    });

    it('returns false for empty string', () => {
      const result = pythonUtils.handlePythonLogMessage('');
      expect(result).toBe(false);
    });
  });
});
