import logger from '../logger';
import { runPythonCode } from './wrapper';
import {
  runPythonLegacy,
  PythonExecutionError,
  PythonAST,
} from './pythonCore';

// Re-export for external use
export { PythonAST, PythonExecutionError } from './pythonCore';

/**
 * Options for Python execution
 */
export interface PythonRunOptions {
  pythonExecutable?: string;
  timeout?: number;
  cwd?: string;
}

/**
 * Type-safe Python function call result
 */
export type PythonResult<T = any> = T;

/**
 * Smart Python runner that handles both file paths and dereferenced content.
 * This solves the dereferencing issue across all Python constructs in a DRY way.
 *
 * When configs are dereferenced, file:// references become file content instead of paths.
 * This function detects the difference and handles both cases appropriately.
 *
 * @template T - Expected return type from Python function
 */
export async function runPython<T = any>(
  pathOrContent: string,
  functionName: string,
  args: readonly unknown[],
  options: PythonRunOptions = {},
): Promise<PythonResult<T>> {
  logger.debug(`runPython called with functionName: ${functionName}`);

  // Detect if this is dereferenced file content or a file path
  if (isPythonContent(pathOrContent)) {
    logger.debug('Detected dereferenced Python content, executing inline');
    return await handlePythonContent(pathOrContent, functionName, args);
  } else {
    logger.debug(`Detected file path, executing: ${pathOrContent}`);
    return await runPythonLegacy(
      pathOrContent,
      functionName,
      args as (string | number | object | undefined)[],
      options,
    );
  }
}

/**
 * Detects if a string is Python file content (dereferenced) vs a file path.
 * Uses AST parsing and heuristics for reliable detection.
 */
function isPythonContent(pathOrContent: string): boolean {
  if (!pathOrContent || typeof pathOrContent !== 'string') {
    return false;
  }

  // Use AST parsing for more accurate detection
  try {
    const nodes = PythonAST.parse(pathOrContent);
    if (nodes.length > 0) {
      return true; // Found Python AST nodes
    }
  } catch {
    // AST parsing failed, fall back to heuristics
  }

  // Fallback: file paths are typically short and don't have Python keywords
  const hasNewlines = pathOrContent.includes('\n');
  const pythonKeywords = ['def ', 'class ', 'import ', 'from ', 'return ', 'if ', 'else:', 'elif '];
  const hasKeywords = pythonKeywords.some((keyword) => pathOrContent.includes(keyword));

  // If it has keywords AND newlines, it's likely code
  return hasKeywords && hasNewlines;
}

/**
 * Handles dereferenced Python file content by executing it and calling the target function.
 * Creates a wrapper script that loads the content and calls the specified function.
 */
async function handlePythonContent<T = any>(
  content: string,
  functionName: string,
  args: readonly unknown[],
): Promise<PythonResult<T>> {
  // Use AST parsing to detect functions more reliably
  const functions = PythonAST.getFunctionNames(content);
  const detectedFunctionName = functions.length > 0 ? functions[0] : null;

  // Determine which function to call
  let targetFunctionName = functionName;
  if (detectedFunctionName) {
    // If we detected a function and no specific function was requested, use the detected one
    if (!functionName || functionName === 'main' || functionName === 'default') {
      targetFunctionName = detectedFunctionName;
    }
  }

  logger.debug(`Executing Python content with function: ${targetFunctionName}`);

  // Create a wrapper script that includes the content and calls the target function
  const wrapperScript = `${content}

# Smart runner wrapper - call the target function
def __smart_runner_main__(*args):
    return ${targetFunctionName}(*args)
`;

  try {
    return await runPythonCode(
      wrapperScript,
      '__smart_runner_main__',
      args as (string | object | undefined)[],
    );
  } catch (error) {
    // Enhanced error handling with context and suggestions
    throw PythonExecutionError.fromPythonError(
      error instanceof Error ? error : new Error(String(error)),
      {
        functionName: targetFunctionName,
        content,
      },
    );
  }
}
