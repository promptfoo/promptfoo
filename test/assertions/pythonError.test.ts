import { formatPythonAssertionError } from '../../src/assertions/pythonError';

describe('formatPythonAssertionError', () => {
  it('should format basic errors with file and function context', () => {
    const error = new Error('Something went wrong');
    const formatted = formatPythonAssertionError(error, '/path/to/file.py', 'get_assert');

    expect(formatted).toContain('Python assertion error in /path/to/file.py::get_assert');
    expect(formatted).toContain('Something went wrong');
  });

  it('should provide helpful message for TypeError with missing arguments', () => {
    const error = new Error(
      'TypeError: get_assert() missing 1 required positional argument: "context"',
    );
    const formatted = formatPythonAssertionError(error, '/path/to/file.py', 'get_assert');

    expect(formatted).toContain('Function signature mismatch');
    expect(formatted).toContain(
      'Make sure your function accepts two parameters: (output, context)',
    );
    expect(formatted).toContain('https://promptfoo.dev/docs/configuration/expected-outputs#python');
  });

  it('should provide helpful message for ModuleNotFoundError', () => {
    const error = new Error('ModuleNotFoundError: No module named "numpy"');
    const formatted = formatPythonAssertionError(error, '/path/to/file.py', 'get_assert');

    expect(formatted).toContain("Missing module 'numpy'");
    expect(formatted).toContain('pip install numpy');
  });

  it('should provide helpful message for missing function', () => {
    const error = new Error("AttributeError: module has no attribute 'get_assert'");
    const formatted = formatPythonAssertionError(error, '/path/to/file.py', 'get_assert');

    expect(formatted).toContain("Function 'get_assert' not found");
    expect(formatted).toContain('Make sure the function is defined at the module level');
  });

  it('should provide helpful message for invalid return value', () => {
    const error = new Error('Invalid JSON: Unexpected token when parsing result: invalid json');
    const formatted = formatPythonAssertionError(error, '/path/to/file.py', 'get_assert');

    expect(formatted).toContain('Invalid return value');
    expect(formatted).toContain('bool (True/False)');
    expect(formatted).toContain('https://promptfoo.dev/docs/configuration/expected-outputs#python');
    expect(formatted).toContain('float (0.0 to 1.0 for score)');
    expect(formatted).toContain('dict with keys');
  });
});
