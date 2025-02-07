import ivm from 'isolated-vm';
import logger from '../logger';

// List of globals to disable for security
export const DISABLED_GLOBALS = [
  'Array',
  'ArrayBuffer',
  'AsyncFunction',
  'Atomics',
  'Buffer',
  'DataView',
  'Error',
  'Function',
  'Generator',
  'GeneratorFunction',
  'Promise',
  'Proxy',
  'SharedArrayBuffer',
  'WebAssembly',
  'process',
  'setInterval',
  'setTimeout',
  'setImmediate',
  'clearInterval',
  'clearTimeout',
  'clearImmediate',
  'require',
  'module',
  'exports',
  '__filename',
  '__dirname',
];

// Helper to create safe function shims that can be called from within the sandbox
export function getFunctionShim(
  fnName: string,
): (...args: any[]) => { fnName: string; args: any[] } {
  return function (...args) {
    return {
      fnName,
      args,
    };
  };
}

// Resolve any safe function calls in the result
export async function resolveFunctions(
  obj: any,
  safeHelpers: Record<string, Function>,
  visited = new WeakSet(),
): Promise<void> {
  if (!obj || visited.has(obj)) {
    return;
  }

  if (typeof obj === 'object') {
    visited.add(obj);

    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === 'object' && obj[key].fnName) {
        const { fnName, args } = obj[key];
        const fn = safeHelpers[fnName];
        if (fn) {
          if (fn.constructor.name === 'AsyncFunction') {
            obj[key] = await fn(...args);
          } else {
            obj[key] = fn(...args);
          }
        }
      }
      await resolveFunctions(obj[key], safeHelpers);
    }
  }
}

// Default safe helper functions available in sandbox
export const DEFAULT_SAFE_HELPERS = {
  log: (message: string, ...args: unknown[]) => {
    // Convert args to string to avoid spread operator issues
    logger.debug(message + (args.length ? ' ' + args.join(' ') : ''));
  },
  error: (message: string, ...args: unknown[]) => {
    // Convert args to string to avoid spread operator issues
    logger.error(message + (args.length ? ' ' + args.join(' ') : ''));
  },
  parseJson: (str: string) => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  },
};

interface SandboxOptions {
  timeout?: number;
  allowAsync?: boolean;
  additionalHelpers?: Record<string, Function>;
  memoryLimitMb?: number;
}

/**
 * Evaluates untrusted code in a secure sandbox environment using isolated-vm
 * @param code The untrusted code to execute
 * @param context Variables and functions to expose to the sandbox
 * @param options Configuration options for the sandbox
 * @returns The result of executing the code
 */
export async function evalInSandbox(
  code: string,
  context: Record<string, any> = {},
  options: SandboxOptions = {},
): Promise<any> {
  const {
    timeout = 3000,
    allowAsync = true,
    additionalHelpers = {},
    memoryLimitMb = 128,
  } = options;

  // Create a new isolate with memory limit
  const isolate = new ivm.Isolate({
    memoryLimit: memoryLimitMb,
    onCatastrophicError: (err) => {
      logger.error(`Catastrophic error in isolate: ${String(err)}`);
    },
  });

  try {
    // Create a new context
    const ctx = await isolate.createContext();
    const jail = ctx.global;

    // Set up the sandbox environment
    const sandbox = {
      ...context,
      ...Object.fromEntries(
        Object.entries({ ...DEFAULT_SAFE_HELPERS, ...additionalHelpers }).map(([key, fn]) => [
          key,
          getFunctionShim(key),
        ]),
      ),
    };

    // Transfer sandbox values into the context
    for (const [key, value] of Object.entries(sandbox)) {
      await jail.set(key, new ivm.Reference(value));
    }

    // Disable unsafe globals
    for (const global of DISABLED_GLOBALS) {
      await jail.set(global, undefined);
    }

    // Compile and run the code
    const script = await isolate.compileScript(`
      ${allowAsync ? '(async function() {' : '(function() {'}
        ${code.trim()}
      })()
    `);

    const result = await script.run(ctx, { timeout });
    const unwrappedResult = result instanceof ivm.Reference ? await result.copy() : result;

    // Resolve any safe function calls in the result
    await resolveFunctions(unwrappedResult, { ...DEFAULT_SAFE_HELPERS, ...additionalHelpers });
    return unwrappedResult;
  } catch (err) {
    // Check if error is a timeout error by checking its message
    // since isolated-vm doesn't export TrapError
    if (err instanceof Error && err.message.includes('execution interrupted (timeout)')) {
      logger.error(`Sandbox execution timed out after ${timeout}ms`);
      throw new Error(`Sandbox execution timed out after ${timeout}ms`);
    }
    logger.error(`Error in sandboxed execution: ${String(err)}`);
    throw new Error(`Sandbox execution failed: ${String(err)}`);
  } finally {
    // Cleanup
    isolate.dispose();
  }
}

/**
 * Creates a sandboxed function that can be called multiple times with different inputs
 * @param code The untrusted function code
 * @param options Configuration options for the sandbox
 * @returns A function that executes the code in a sandbox
 */
export function createSandboxedFunction(
  code: string,
  options: SandboxOptions = {},
): (...args: any[]) => Promise<any> {
  const isFunctionExpression = /^(\(.*?\)\s*=>|function\s*\(.*?\))/.test(code.trim());

  if (!isFunctionExpression) {
    throw new Error('Code must be a function expression (arrow function or regular function)');
  }

  return async (...args: any[]) => {
    return evalInSandbox(`return (${code.trim()})(...args);`, { args }, options);
  };
}
