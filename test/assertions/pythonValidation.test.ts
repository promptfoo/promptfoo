import * as fs from 'fs';
import {
  validatePythonAssertionFile,
  formatPythonAssertionError,
} from '../../src/assertions/pythonValidation';

jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
  },
}));

describe('validatePythonAssertionFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject files without .py extension', async () => {
    const result = await validatePythonAssertionFile('/path/to/file.txt');
    
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('does not have a .py extension');
  });

  it('should reject non-existent files', async () => {
    (fs.promises.stat as jest.Mock).mockRejectedValue(new Error('ENOENT'));
    
    const result = await validatePythonAssertionFile('/path/to/missing.py');
    
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should reject paths that are directories', async () => {
    (fs.promises.stat as jest.Mock).mockResolvedValue({
      isFile: () => false,
    });
    
    const result = await validatePythonAssertionFile('/path/to/dir.py');
    
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('is not a file');
  });

  it('should accept valid Python files', async () => {
    (fs.promises.stat as jest.Mock).mockResolvedValue({
      isFile: () => true,
    });
    
    const result = await validatePythonAssertionFile('/path/to/file.py');
    
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('formatPythonAssertionError', () => {
  it('should format basic errors with file and function context', () => {
    const error = new Error('Something went wrong');
    const formatted = formatPythonAssertionError(error, '/path/to/file.py', 'get_assert');
    
    expect(formatted).toContain('Python assertion error in /path/to/file.py::get_assert');
    expect(formatted).toContain('Something went wrong');
  });

  it('should provide helpful message for TypeError with missing arguments', () => {
    const error = new Error('TypeError: get_assert() missing 1 required positional argument: "context"');
    const formatted = formatPythonAssertionError(error, '/path/to/file.py', 'get_assert');
    
    expect(formatted).toContain('Function signature mismatch');
    expect(formatted).toContain('Make sure your function accepts two parameters: (output, context)');
  });

  it('should provide helpful message for ModuleNotFoundError', () => {
    const error = new Error('ModuleNotFoundError: No module named "numpy"');
    const formatted = formatPythonAssertionError(error, '/path/to/file.py', 'get_assert');
    
    expect(formatted).toContain('Missing module \'numpy\'');
    expect(formatted).toContain('pip install numpy');
  });

  it('should provide helpful message for missing function', () => {
    const error = new Error('AttributeError: module has no attribute \'get_assert\'');
    const formatted = formatPythonAssertionError(error, '/path/to/file.py', 'get_assert');
    
    expect(formatted).toContain('Function \'get_assert\' not found');
    expect(formatted).toContain('Make sure the function is defined at the module level');
  });

  it('should provide helpful message for invalid return value', () => {
    const error = new Error('Invalid JSON: Unexpected token when parsing result: invalid json');
    const formatted = formatPythonAssertionError(error, '/path/to/file.py', 'get_assert');
    
    expect(formatted).toContain('Invalid return value');
    expect(formatted).toContain('bool (True/False)');
    expect(formatted).toContain('float (0.0 to 1.0 for score)');
    expect(formatted).toContain('dict with keys');
  });
}); 