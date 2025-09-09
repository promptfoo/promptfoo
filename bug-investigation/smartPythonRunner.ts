import { runPython } from '../src/python/pythonUtils';
import { runPythonCode } from '../src/python/wrapper';

/**
 * Smart Python runner that handles both file paths and dereferenced content
 * This solves the dereferencing issue across all Python constructs in a DRY way
 */
export async function runPythonSmart(
  pathOrContent: string,
  functionName: string, 
  args: any[]
): Promise<any> {
  // Detect if this is dereferenced file content or a file path
  if (pathOrContent.includes('def ')) {
    // Handle dereferenced Python file content
    return await handlePythonContent(pathOrContent, functionName, args);
  } else {
    // Handle file path (original behavior)
    return await runPython(pathOrContent, functionName, args);
  }
}

/**
 * Handles dereferenced Python file content by executing it and calling the target function
 */
async function handlePythonContent(content: string, functionName: string, args: any[]): Promise<any> {
  // Extract actual function name from content if available
  const functionMatch = content.match(/def\s+(\w+)\s*\(/);
  const actualFunctionName = functionMatch ? functionMatch[1] : functionName;
  
  // Create a wrapper script that executes the content and calls the function
  const wrapperScript = `${content}

def main(*args):
    return ${actualFunctionName}(*args)`;

  return await runPythonCode(wrapperScript, 'main', args);
}