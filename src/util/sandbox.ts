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
          context.global.setSync(`arg${index}`, new ivm.ExternalCopy(arg).copyInto());
          return `arg${index}`;
        } else {
          context.global.setSync(`arg${index}`, arg);
          return `arg${index}`;
        }
      });

      // Execute the function with the arguments
      const argsList = serializedArgs.join(', ');
      const script = isolate.compileScriptSync(`
        const fn = ${functionCode};
        fn(${argsList});
      `);

      const result = script.runSync(context, { timeout: 5000 });

      return result;
    } catch (error) {
      logger.error(`Secure function execution error: ${error}`);
      throw new Error(`Failed to execute secure function: ${String(error)}`);
    } finally {
      context.release();
    }
  };
}

/**
 * Execute code safely and return the result (for function callbacks)
 * @param code - The JavaScript code to execute
 * @returns The result of execution
 */
export function executeFunctionSafely(code: string): any {
  const isolate = getIsolate();
  const context = isolate.createContextSync();

  try {
    const script = isolate.compileScriptSync(`(${code})`);
    const result = script.runSync(context, { timeout: 5000 });
    return result;
  } catch (error) {
    logger.error(`Function execution error: ${error}`);
    throw new Error(`Failed to execute function: ${String(error)}`);
  } finally {
    context.release();
  }
}

/**
 * Execute a transform function safely (specific to promptfoo's transform pattern)
 * @param code - The transform function code (either a function or expression)
 * @param data - JSON data parameter
 * @param text - Text parameter
 * @param context - Context parameter
 * @returns The transform result
 */
export function executeTransformSafely(
  code: string,
  data: any,
  text: string,
  context?: any
): any {
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