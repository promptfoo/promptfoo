/**
 * Formats Python assertion errors with helpful context
 * Enhances Python's own error messages with additional guidance for assertions
 */
export function formatPythonAssertionError(
  error: Error,
  filePath: string,
  functionName: string,
): string {
  const errorMessage = error.message;

  // Check for common Python errors and add helpful context
  if (
    errorMessage.includes('TypeError') &&
    errorMessage.includes('missing') &&
    errorMessage.includes('required positional argument')
  ) {
    return `Python assertion error: Function signature mismatch\n${errorMessage}\n\nMake sure your function accepts two parameters: (output, context)\n\nSee https://promptfoo.dev/docs/configuration/expected-outputs#python for documentation.`;
  }

  if (errorMessage.includes('ModuleNotFoundError') || errorMessage.includes('ImportError')) {
    const moduleMatch = errorMessage.match(/No module named ['"]([^'"]+)['"]/);
    const moduleName = moduleMatch ? moduleMatch[1] : 'the required module';
    return `Python assertion error: Missing module '${moduleName}'\n\nInstall it with: pip install ${moduleName}`;
  }

  if (
    errorMessage.includes('AttributeError') &&
    errorMessage.includes(`has no attribute '${functionName}'`)
  ) {
    return `Python assertion error: Function '${functionName}' not found in ${filePath}\n\nMake sure the function is defined at the module level.`;
  }

  if (errorMessage.includes('Invalid JSON') && errorMessage.includes('when parsing result')) {
    return `Python assertion error: Invalid return value\n\nYour function must return one of:\n  - bool (True/False)\n  - float (0.0 to 1.0 for score)\n  - dict with keys: {"pass": bool, "score": float, "reason": str}\n\nSee https://promptfoo.dev/docs/configuration/expected-outputs#python for documentation.`;
  }

  // For other errors, just enhance with file/function context
  return `Python assertion error in ${filePath}::${functionName}\n${errorMessage}`;
}