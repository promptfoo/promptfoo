import fs from 'fs';
import path from 'path';

// Mock util before any imports that use it - define the mock inline
jest.mock('util', () => {
  const actualUtil = jest.requireActual('util');
  const mockExecFile = jest.fn();

  return {
    ...actualUtil,
    promisify: jest.fn((fn) => {
      if (fn && fn.name === 'execFile') {
        return mockExecFile;
      }
      return actualUtil.promisify(fn);
    }),
    __mockExecFileAsync: mockExecFile, // Export for test access
  };
});

import { PythonShell } from 'python-shell';
import { getEnvBool, getEnvString } from '../../src/envars';
import * as pythonUtils from '../../src/python/pythonUtils';

// Get reference to the mock after imports
const mockExecFileAsync = (require('util') as any).__mockExecFileAsync;

// Mock setup
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.mock('../../src/envars', () => ({
  getEnvString: jest.fn(),
  getEnvBool: jest.fn(),
}));

const mockPythonShellInstance = {
  stdout: { on: jest.fn() },
  stderr: { on: jest.fn() },
  end: jest.fn(),
};

jest.mock('python-shell', () => ({
  PythonShell: jest.fn(() => mockPythonShellInstance),
}));

describe('Python Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecFileAsync.mockReset();
    pythonUtils.state.cachedPythonPath = null;
    pythonUtils.state.validationPromise = null;
    // Set default mock return values
    jest.mocked(getEnvString).mockReturnValue('');
    jest.mocked(getEnvBool).mockReturnValue(false);
  });

  describe('getSysExecutable', () => {
    it('should return Python executable path from sys.executable', async () => {
      // Mock for Unix-like systems (not Windows)
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      mockExecFileAsync.mockResolvedValue({
        stdout: '/usr/bin/python3.8\n',
        stderr: '',
      });

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

      // Mock 'where python' command to return multiple paths including WindowsApps
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout:
            'C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe\nC:\\Python39\\python.exe\n',
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: 'Python 3.9.0\n',
          stderr: '',
        });

      const result = await pythonUtils.getSysExecutable();

      // Should skip WindowsApps and use the real Python installation
      expect(result).toBe('C:\\Python39\\python.exe');
      expect(mockExecFileAsync).toHaveBeenCalledWith('where', ['python']);
      expect(mockExecFileAsync).toHaveBeenCalledWith('C:\\Python39\\python.exe', ['--version']);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should fall back to py commands if Windows where fails', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Mock 'where python' to fail, then 'py' sys.executable to succeed
      mockExecFileAsync
        .mockRejectedValueOnce(new Error('where command failed'))
        .mockResolvedValueOnce({
          stdout: 'C:\\Python39\\python.exe\n',
          stderr: '',
        });

      const result = await pythonUtils.getSysExecutable();

      expect(result).toBe('C:\\Python39\\python.exe');
      expect(mockExecFileAsync).toHaveBeenCalledWith('where', ['python']);
      expect(mockExecFileAsync).toHaveBeenCalledWith('py', [
        '-c',
        'import sys; print(sys.executable)',
      ]);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should try direct python command as final Windows fallback', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Mock everything to fail except final direct python command
      mockExecFileAsync
        .mockRejectedValueOnce(new Error('where failed'))
        .mockRejectedValueOnce(new Error('py failed'))
        .mockRejectedValueOnce(new Error('py -3 failed'))
        .mockResolvedValueOnce({
          stdout: 'Python 3.9.0\n',
          stderr: '',
        });

      const result = await pythonUtils.getSysExecutable();

      expect(result).toBe('python');
      expect(mockExecFileAsync).toHaveBeenCalledWith('where', ['python']);
      expect(mockExecFileAsync).toHaveBeenCalledWith('python', ['--version']);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should add .exe suffix on Windows if missing', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      mockExecFileAsync.mockRejectedValueOnce(new Error('where failed')).mockResolvedValueOnce({
        stdout: 'C:\\Python39\\python\n',
        stderr: '',
      });

      const result = await pythonUtils.getSysExecutable();

      expect(result).toBe('C:\\Python39\\python.exe');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should handle empty where output gracefully', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Mock 'where python' to return empty output, then py to succeed
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: 'C:\\Python39\\python.exe\n',
          stderr: '',
        });

      const result = await pythonUtils.getSysExecutable();

      expect(result).toBe('C:\\Python39\\python.exe');
      expect(mockExecFileAsync).toHaveBeenCalledWith('where', ['python']);
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
        mockExecFileAsync.mockResolvedValue({
          stdout: 'Python 3.8.10\n',
          stderr: '',
        });

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
        jest.useFakeTimers();
        const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve) => {
          setTimeout(() => {
            resolve({
              stdout: 'Python 3.8.10\n',
              stderr: '',
            });
          }, 3000);
        });

        mockExecFileAsync.mockReturnValue(execPromise as any);

        const resultPromise = pythonUtils.tryPath('/usr/bin/python3');
        jest.advanceTimersByTime(2501);

        const result = await resultPromise;

        expect(result).toBeNull();
        expect(mockExecFileAsync).toHaveBeenCalledWith('/usr/bin/python3', ['--version']);
        jest.useRealTimers();
      });
    });
  });

  describe('validatePythonPath', () => {
    describe('caching behavior', () => {
      it('should validate and cache an existing Python 3 path', async () => {
        mockExecFileAsync.mockResolvedValue({
          stdout: 'Python 3.8.10\n',
          stderr: '',
        });

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
        // Primary path fails
        mockExecFileAsync.mockRejectedValueOnce(new Error('Command failed'));

        if (process.platform === 'win32') {
          // Windows: All getSysExecutable strategies eventually succeed via final fallback
          mockExecFileAsync.mockRejectedValueOnce(new Error('Command failed')); // where python fails
          mockExecFileAsync.mockRejectedValueOnce(new Error('Command failed')); // py -c sys.executable fails
          mockExecFileAsync.mockRejectedValueOnce(new Error('Command failed')); // py -3 -c sys.executable fails
          // Final fallback (python) validation succeeds
          mockExecFileAsync.mockResolvedValueOnce({
            stdout: 'Python 3.9.5\n',
            stderr: '',
          });
        } else {
          // Unix: getSysExecutable strategies succeed on python3
          mockExecFileAsync.mockResolvedValueOnce({
            stdout: '/usr/bin/python3\n',
            stderr: '',
          });
        }

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
        jest.mocked(getEnvString).mockReturnValue('/custom/python/path');
        mockExecFileAsync.mockResolvedValue({
          stdout: 'Python 3.8.10\n',
          stderr: '',
        });

        const result = await pythonUtils.validatePythonPath('/custom/python/path', true);

        expect(result).toBe('/custom/python/path');
        expect(mockExecFileAsync).toHaveBeenCalledWith('/custom/python/path', ['--version']);
      });
    });

    describe('concurrent validation', () => {
      it('should share validation promise between concurrent calls', async () => {
        const firstPromise = new Promise<{ stdout: string; stderr: string }>((resolve) => {
          setTimeout(() => {
            resolve({
              stdout: 'Python 3.8.10\n',
              stderr: '',
            });
          }, 100);
        });

        mockExecFileAsync.mockReturnValueOnce(firstPromise as any);

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

        // Create a promise that can be resolved manually
        let resolvePromise: (value: any) => void;
        const controlledPromise = new Promise<{ stdout: string; stderr: string }>((resolve) => {
          resolvePromise = resolve;
        });

        mockExecFileAsync.mockResolvedValue({
          stdout: 'Python 3.8.10\n',
          stderr: '',
        });

        // Reset mock to use our controlled promise
        mockExecFileAsync.mockReset();
        mockExecFileAsync.mockReturnValueOnce(controlledPromise as any);

        // Start multiple validations without waiting
        const promises = [
          pythonUtils.validatePythonPath('python', false),
          pythonUtils.validatePythonPath('python', false),
          pythonUtils.validatePythonPath('python', false),
        ];

        // Resolve the promise after a delay
        setTimeout(() => {
          resolvePromise!({
            stdout: 'Python 3.8.10\n',
            stderr: '',
          });
        }, 10);

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
      jest.clearAllMocks();
    });

    it('should execute a Python script with proper arguments', async () => {
      jest.mocked(fs.writeFileSync).mockImplementation();
      jest
        .mocked(fs.readFileSync)
        .mockReturnValue(JSON.stringify({ type: 'final_result', data: 42 }));
      jest.mocked(fs.unlinkSync).mockImplementation();
      mockExecFileAsync.mockResolvedValue({
        stdout: 'Python 3.8.10\n',
        stderr: '',
      });

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

    it('should throw an error if Python script returns invalid JSON', async () => {
      jest.mocked(fs.writeFileSync).mockImplementation();
      jest.mocked(fs.readFileSync).mockReturnValue('invalid json');
      jest.mocked(fs.unlinkSync).mockImplementation();
      mockExecFileAsync.mockResolvedValue({
        stdout: 'Python 3.8.10\n',
        stderr: '',
      });

      mockPythonShellInstance.end.mockImplementation((callback: any) => {
        callback(null);
      });

      await expect(pythonUtils.runPython('/path/to/script.py', 'test_method', [])).rejects.toThrow(
        'Invalid JSON',
      );
    });

    it('should throw an error if Python script does not return final_result', async () => {
      jest.mocked(fs.writeFileSync).mockImplementation();
      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ type: 'other', data: 42 }));
      jest.mocked(fs.unlinkSync).mockImplementation();
      mockExecFileAsync.mockResolvedValue({
        stdout: 'Python 3.8.10\n',
        stderr: '',
      });

      mockPythonShellInstance.end.mockImplementation((callback: any) => {
        callback(null);
      });

      await expect(pythonUtils.runPython('/path/to/script.py', 'test_method', [])).rejects.toThrow(
        'The Python script `call_api` function must return a dict with an `output`',
      );
    });

    it('should clean up temporary files even on error', async () => {
      jest.mocked(fs.writeFileSync).mockImplementation();
      jest.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read failed');
      });
      jest.mocked(fs.unlinkSync).mockImplementation();
      mockExecFileAsync.mockResolvedValue({
        stdout: 'Python 3.8.10\n',
        stderr: '',
      });

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
});
