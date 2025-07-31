import * as fs from 'fs';

/**
 * Basic validation for Python files
 * We only check if the file exists and has .py extension
 * Python will handle all other validation (function existence, signatures, etc.)
 */
export async function validatePythonFile(
  filePath: string,
): Promise<{ isValid: boolean; error?: string }> {
  // Check if file has .py extension
  if (!filePath.endsWith('.py')) {
    return {
      isValid: false,
      error: `File "${filePath}" does not have a .py extension`,
    };
  }

  // Check if file exists
  try {
    await fs.promises.stat(filePath);
  } catch {
    return {
      isValid: false,
      error: `Python file "${filePath}" not found`,
    };
  }

  return { isValid: true };
}

/**
 * Formats Python runtime errors with helpful context
 * Enhances Python's own error messages with additional guidance
 * 
 * @param error - The error object from Python execution
 * @param filePath - Path to the Python file (or '<inline>' for inline code)
 * @param functionName - Name of the function being called
 * @param context - Context about where the error occurred (e.g., 'assertion', 'provider', 'transform')
 */
export function formatPythonError(
  error: Error,
  filePath: string,
  functionName: string,
  context: 'assertion' | 'provider' | 'test' | 'transform' | 'prompt' = 'assertion',
): string {
  const errorMessage = error.message;

  // Check for common Python errors and add helpful context
  if (
    errorMessage.includes('TypeError') &&
    errorMessage.includes('missing') &&
    errorMessage.includes('required positional argument')
  ) {
    const params = context === 'assertion' ? '(output, context)' : 
                   context === 'provider' ? '(prompt, options, context)' :
                   context === 'test' ? '(config)' :
                   context === 'transform' ? '(output, context)' :
                   '(context)';
    const docLink = context === 'assertion' ? 'https://promptfoo.dev/docs/configuration/expected-outputs#python' :
                    context === 'provider' ? 'https://promptfoo.dev/docs/providers/python' :
                    'https://promptfoo.dev/docs/configuration/guide';
    return `Python ${context} error: Function signature mismatch\n${errorMessage}\n\nMake sure your function accepts the correct parameters: ${params}\n\nSee ${docLink} for documentation.`;
  }

  if (errorMessage.includes('ModuleNotFoundError') || errorMessage.includes('ImportError')) {
    const moduleMatch = errorMessage.match(/No module named ['"]([^'"]+)['"]/);
    const moduleName = moduleMatch ? moduleMatch[1] : 'the required module';
    return `Python ${context} error: Missing module '${moduleName}'\n\nInstall it with: pip install ${moduleName}`;
  }

  if (
    errorMessage.includes('AttributeError') &&
    errorMessage.includes(`has no attribute '${functionName}'`)
  ) {
    return `Python ${context} error: Function '${functionName}' not found in ${filePath}\n\nMake sure the function is defined at the module level.`;
  }

  if (errorMessage.includes('Invalid JSON') && errorMessage.includes('when parsing result')) {
    const returnValueHelp = context === 'assertion' ? 
      'Your function must return one of:\n  - bool (True/False)\n  - float (0.0 to 1.0 for score)\n  - dict with keys: {"pass": bool, "score": float, "reason": str}' :
      context === 'provider' ?
      'Your function must return a dict with an "output" key' :
      context === 'test' ?
      'Your function must return a list of test cases' :
      'Your function must return the transformed value';
    const docLink = context === 'assertion' ? 'https://promptfoo.dev/docs/configuration/expected-outputs#python' :
                    context === 'provider' ? 'https://promptfoo.dev/docs/providers/python' :
                    'https://promptfoo.dev/docs/configuration/guide';
    return `Python ${context} error: Invalid return value\n\n${returnValueHelp}\n\nSee ${docLink} for documentation.`;
  }

  // For other errors, just enhance with file/function context
  return `Python ${context} error in ${filePath}::${functionName}\n${errorMessage}`;
}
