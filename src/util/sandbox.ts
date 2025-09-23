/**
 * Secure sandbox utility for executing user-provided JavaScript code
 * using isolated-vm to prevent RCE vulnerabilities.
 *
 * This replaces the unsafe `new Function()` calls throughout the codebase.
 */

import ivm from 'isolated-vm';
import logger from '../logger';

// Global isolate instance for reuse
let globalIsolate: ivm.Isolate | null = null;

/**
 * Get or create a shared isolate instance
 */
function getIsolate(): ivm.Isolate {
  if (!globalIsolate) {
    globalIsolate = new ivm.Isolate({
      memoryLimit: 128, // 128MB memory limit
      inspector: false, // Disable inspector for security
    });
  }
  return globalIsolate;
}

/**
 * Clean up the global isolate
 */
export function disposeSandbox(): void {
  if (globalIsolate) {
    globalIsolate.dispose();
    globalIsolate = null;
  }
}

/**
 * Execute JavaScript code safely in an isolated VM
 * @param code - The JavaScript code to execute
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns The result of the execution
 */
export function executeInSandbox(code: string, timeout: number = 5000): any {
  const isolate = getIsolate();
  const context = isolate.createContextSync();

  try {
    // Set a timeout for execution
    const script = isolate.compileScriptSync(code);
    const result = script.runSync(context, { timeout });
    return result;
  } catch (error) {
    logger.error(`Sandbox execution error: ${error}`);
    throw new Error(`Failed to execute sandboxed code: ${String(error)}`);
  } finally {
    context.release();
  }
}

/**
 * Create a secure replacement for new Function()
 * @param params - Parameter names for the function
 * @param code - The function body code
 * @returns A function that executes the code safely
 */
export function createSecureFunction(...args: string[]): Function {
  if (args.length === 0) {
    throw new Error('createSecureFunction requires at least a function body');
  }

  const code = args.pop() as string;
  const params = args;

  // Validate syntax during creation by attempting to compile
  const isolate = getIsolate();
  const context = isolate.createContextSync();
  try {
    const functionCode = `
      (function(${params.join(', ')}) {
        ${code}
      })
    `;
    // Test compilation - this will throw if syntax is invalid
    isolate.compileScriptSync(functionCode);
    context.release();
  } catch (error) {
    context.release();
    throw error; // Re-throw syntax errors during creation
  }

  // Create a wrapper function that executes in sandbox
  return function (...callArgs: any[]): any {
    const isolate = getIsolate();
    const context = isolate.createContextSync();

    try {
      // Build the function code
      const functionCode = `
        (function(${params.join(', ')}) {
          ${code}
        })
      `;

      // Convert arguments to transferable format and set them in the context
      const serializedArgs = callArgs.map((arg, index) => {
        if (typeof arg === 'object' && arg !== null) {
          try {
            context.global.setSync(`arg${index}`, new ivm.ExternalCopy(arg).copyInto());
            return `arg${index}`;
          } catch (error) {
            // If ExternalCopy fails (e.g., for functions), serialize as JSON
            try {
              const jsonArg = JSON.stringify(arg);
              context.global.setSync(`arg${index}`, jsonArg);
              return `JSON.parse(arg${index})`;
            } catch (jsonError) {
              // If JSON serialization also fails, convert to string
              context.global.setSync(`arg${index}`, String(arg));
              return `arg${index}`;
            }
          }
        } else {
          context.global.setSync(`arg${index}`, arg);
          return `arg${index}`;
        }
      });

      // Execute the function with the arguments
      const argsList = serializedArgs.join(', ');
      const script = isolate.compileScriptSync(`
        (function() {
          const result = (${functionCode})(${argsList});
          // Serialize complex objects to transfer them from the VM
          if (typeof result === 'object' && result !== null) {
            return '__SANDBOX_JSON__' + JSON.stringify(result);
          }
          return result;
        })()
      `);

      const result = script.runSync(context, { timeout: 5000 });

      // Handle JSON-serialized objects returned from the VM
      if (typeof result === 'string' && result.startsWith('__SANDBOX_JSON__')) {
        try {
          return JSON.parse(result.slice('__SANDBOX_JSON__'.length));
        } catch {
          // Failed to parse, return without prefix
          return result.slice('__SANDBOX_JSON__'.length);
        }
      }
      return result;
    } catch (error) {
      logger.error(`Secure function execution error: ${error}`);
      throw error; // Re-throw original error to preserve caller's error handling
    } finally {
      context.release();
    }
  };
}

/**
 * Execute code safely and return the result (for function callbacks)
 * @param code - The JavaScript code to execute
 * @returns A wrapper function that executes the code safely when called
 */
export function executeFunctionSafely(code: string): any {
  // Return a wrapper function that will execute the code in isolation when called
  return (...callArgs: any[]) => {
    const isolate = getIsolate();
    const context = isolate.createContextSync();

    try {
      // Extract parameter names from the function code to determine what to pass
      const trimmedCode = code.trim();

      let executeCode = code;
      if (trimmedCode.startsWith('async function') && !trimmedCode.includes('await')) {
        // Convert simple async function to sync by removing the async keyword
        executeCode = trimmedCode.replace(/^async\s+/, '');
      }

      // Try to extract parameter names from arrow functions and regular functions
      let paramNames: string[] = [];

      // Arrow function: (param1, param2) => ... or param => ...
      const arrowMatch = executeCode.match(/^\s*\(([^)]*)\)\s*=>/);
      if (arrowMatch) {
        paramNames = arrowMatch[1].split(',').map(p => p.trim()).filter(p => p);
      } else {
        // Single parameter arrow function: param => ...
        const singleArrowMatch = executeCode.match(/^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/);
        if (singleArrowMatch) {
          paramNames = [singleArrowMatch[1]];
        } else {
          // Regular function: function(param1, param2) { ... }
          const funcMatch = executeCode.match(/function\s*\([^)]*\)/);
          if (funcMatch) {
            const paramsMatch = funcMatch[0].match(/\(([^)]*)\)/);
            if (paramsMatch) {
              paramNames = paramsMatch[1].split(',').map(p => p.trim()).filter(p => p);
            }
          }
        }
      }

      // Set up variables in the context based on the number of parameters expected
      const argsList: string[] = [];
      for (let i = 0; i < Math.min(paramNames.length, callArgs.length); i++) {
        const argName = `arg${i}`;
        if (typeof callArgs[i] === 'object' && callArgs[i] !== null) {
          try {
            context.global.setSync(argName, new ivm.ExternalCopy(callArgs[i]).copyInto());
          } catch (error) {
            // If ExternalCopy fails, try JSON serialization
            try {
              const jsonArg = JSON.stringify(callArgs[i]);
              context.global.setSync(argName, JSON.parse(jsonArg));
            } catch (jsonError) {
              // If JSON also fails, convert to string
              context.global.setSync(argName, String(callArgs[i]));
            }
          }
        } else {
          context.global.setSync(argName, callArgs[i]);
        }
        argsList.push(argName);
      }

      const script = isolate.compileScriptSync(`
        (function() {
          const fn = (${executeCode});
          return fn(${argsList.join(', ')});
        })();
      `);

      const result = script.runSync(context, { timeout: 5000 });
      return result;
    } catch (error) {
      logger.error(`Function callback execution error: ${error}`);
      throw new Error(`Function callback failed: ${String(error)}`);
    } finally {
      context.release();
    }
  };
}

/**
 * Execute a transform function safely (specific to promptfoo's transform pattern)
 * @param code - The transform function code (either a function or expression)
 * @param data - JSON data parameter
 * @param text - Text parameter
 * @param context - Context parameter
 * @returns The transform result
 */
export function executeTransformSafely(code: string, data: any, text: string, context?: any): any {
  const isolate = getIsolate();
  const vmContext = isolate.createContextSync();

  try {
    const trimmedCode = code.trim();

    // Check if it's a function expression (either arrow or regular)
    const isFunctionExpression = /^(\(.*?\)\s*=>|function\s*\(.*?\))/.test(trimmedCode);

    let executeCode: string;
    if (isFunctionExpression) {
      // It's already a function, call it directly
      executeCode = `(${trimmedCode})(json, text, context)`;
    } else {
      // It's an expression, wrap it in a function and call it
      executeCode = `(function(json, text, context) { return (${trimmedCode}); })(json, text, context)`;
    }

    // Set up the execution environment
    const fullCode = `
      const json = ${JSON.stringify(data)};
      const data = json; // Alias for compatibility
      const text = ${JSON.stringify(text)};
      const context = ${JSON.stringify(context || {})};

      ${executeCode};
    `;

    const script = isolate.compileScriptSync(fullCode);
    const result = script.runSync(vmContext, { timeout: 5000 });

    return result;
  } catch (error) {
    logger.error(`Transform execution error: ${error}`);
    throw new Error(`Failed to execute transform: ${String(error)}`);
  } finally {
    vmContext.release();
  }
}

// Clean up on process exit
process.on('exit', disposeSandbox);
process.on('SIGINT', disposeSandbox);
process.on('SIGTERM', disposeSandbox);
