import logger from '../logger';
import { runPython as runPythonLegacy } from './pythonUtils.legacy';
import { runPythonCode } from './wrapper';
import { extractFunctionNames, hasPythonPatterns } from './pythonUtils.shared';

/**
 * Smart Python runner that handles both file paths and dereferenced content.
 * This solves the dereferencing issue across all Python constructs in a DRY way.
 * 
 * When configs are dereferenced, file:// references become file content instead of paths.
 * This function detects the difference and handles both cases appropriately.
 */
export async function runPython(
  pathOrContent: string,
  functionName: string,
  args: any[],
  options: { pythonExecutable?: string } = {}
): Promise<any> {
  logger.debug(`runPython called with functionName: ${functionName}`);
  
  // Detect if this is dereferenced file content or a file path
  if (isPythonContent(pathOrContent)) {
    logger.debug('Detected dereferenced Python content, executing inline');
    return await handlePythonContent(pathOrContent, functionName, args);
  } else {
    logger.debug(`Detected file path, executing: ${pathOrContent}`);
    return await runPythonLegacy(pathOrContent, functionName, args, options);
  }
}

/**
 * Detects if a string is Python file content (dereferenced) vs a file path.
 * Uses multiple heuristics to reliably distinguish between the two.
 */
function isPythonContent(pathOrContent: string): boolean {
  if (!pathOrContent || typeof pathOrContent !== 'string') {
    return false;
  }

  // Check for obvious Python patterns first
  if (hasPythonPatterns(pathOrContent)) {
    return true;
  }
  
  // Additional check: file paths are typically short and don't have Python keywords
  const hasNewlines = pathOrContent.includes('\n');
  const pythonKeywords = ['def ', 'class ', 'import ', 'from ', 'return ', 'if ', 'else:', 'elif '];
  const hasKeywords = pythonKeywords.some(keyword => pathOrContent.includes(keyword));
  
  // If it has keywords AND newlines, it's likely code
  return hasKeywords && hasNewlines;
}

/**
 * Handles dereferenced Python file content by executing it and calling the target function.
 * Creates a wrapper script that loads the content and calls the specified function.
 */
async function handlePythonContent(content: string, functionName: string, args: any[]): Promise<any> {
  // Extract the actual function name from the content if we can find one
  const functionMatch = content.match(/def\s+(\w+)\s*\(/);
  const detectedFunctionName = functionMatch ? functionMatch[1] : null;
  
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
    return await runPythonCode(wrapperScript, '__smart_runner_main__', args);
  } catch (error) {
    // If the target function doesn't exist, provide a helpful error message
    if (error instanceof Error && error.message.includes('is not defined')) {
      throw new Error(
        `Python function '${targetFunctionName}' not found in dereferenced content. ` +
        `Available functions: ${extractFunctionNames(content).join(', ') || 'none found'}`
      );
    }
    throw error;
  }
}

