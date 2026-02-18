import path from 'node:path';
import { Worker } from 'node:worker_threads';

import cliState from '../cliState';
import { type GradingResult, isGradingResult } from '../types/index';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getProcessShim } from '../util/processShim';

import type { AssertionParams } from '../types/index';

/**
 * Checks if a character at the given index is escaped by backslashes.
 * Handles multiple consecutive backslashes correctly (e.g., \\\\ is two escaped backslashes).
 */
function isCharEscaped(code: string, index: number): boolean {
  let backslashCount = 0;
  let i = index - 1;
  while (i >= 0 && code[i] === '\\') {
    backslashCount++;
    i--;
  }
  return backslashCount % 2 === 1;
}

/**
 * Finds the last semicolon that acts as a statement separator (not inside a string literal).
 * Tracks quote state to skip semicolons inside single quotes, double quotes, and template literals.
 *
 * @returns The index of the last statement-level semicolon, or -1 if none found.
 *
 * @remarks
 * Known limitations (use multiline format for these cases):
 * - Does not handle semicolons inside regex literals (e.g., /;/)
 * - Does not handle semicolons inside template literal expressions (e.g., `${a;b}`)
 */
function findLastStatementSemicolon(code: string): number {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let lastSemiIndex = -1;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const isEscaped = isCharEscaped(code, i);

    // Toggle quote state for unescaped quote characters
    if (!isEscaped) {
      if (char === "'" && !inDoubleQuote && !inTemplate) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote && !inTemplate) {
        inDoubleQuote = !inDoubleQuote;
      } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
        inTemplate = !inTemplate;
      }
    }

    // Track semicolons only when outside all string contexts
    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inTemplate) {
      lastSemiIndex = i;
    }
  }

  return lastSemiIndex;
}

/**
 * Builds a function body from a single-line JavaScript assertion.
 *
 * Handles the case where assertions start with variable declarations (const/let/var).
 * For these, we inject `return` before the final expression instead of prepending it,
 * which would create invalid syntax like `return const x = 1`.
 *
 * @example
 * // Simple expression - prepend return
 * "output === 'test'" → "return output === 'test'"
 *
 * @example
 * // Declaration with final expression - inject return before expression
 * "const s = JSON.parse(output).score; s > 0.5" → "const s = JSON.parse(output).score; return s > 0.5"
 *
 * @example
 * // Semicolons in strings are handled correctly
 * "const s = output; s === 'a;b'" → "const s = output; return s === 'a;b'"
 */
export function buildFunctionBody(code: string): string {
  // Remove trailing semicolons and whitespace for consistent handling
  const trimmed = code.trim().replace(/;+\s*$/, '');

  // Check if the assertion starts with a variable declaration
  if (/^(const|let|var)\s/.test(trimmed)) {
    // Find the last semicolon that's actually a statement separator (not inside a string)
    const lastSemiIndex = findLastStatementSemicolon(trimmed);
    if (lastSemiIndex !== -1) {
      const statements = trimmed.slice(0, lastSemiIndex + 1);
      const expression = trimmed.slice(lastSemiIndex + 1).trim();
      if (expression) {
        // Inject return before the final expression
        return `${statements} return ${expression}`;
      }
    }
    // No semicolon or no final expression - use as-is (will likely error or return undefined)
    return trimmed;
  }

  // Simple expression - prepend return
  return `return ${trimmed}`;
}

async function validateResult(result: unknown): Promise<boolean | number | GradingResult> {
  result = await Promise.resolve(result);
  if (typeof result === 'boolean' || typeof result === 'number' || isGradingResult(result)) {
    return result;
  }
  throw new Error(
    `Custom function must return a boolean, number, or GradingResult object. Got type ${typeof result}: ${JSON.stringify(result)}`,
  );
}

type JavascriptWorkerRequest =
  | {
      mode: 'inline';
      functionBody: string;
      output: unknown;
      context: Record<string, unknown>;
    }
  | {
      mode: 'function';
      functionSource: string;
      output: string;
      context: Record<string, unknown>;
    }
  | {
      mode: 'file';
      filePath: string;
      functionName?: string;
      output: unknown;
      context: Record<string, unknown>;
    };

type JavascriptWorkerResponse =
  | {
      ok: true;
      result: unknown;
    }
  | {
      ok: false;
      error: {
        message: string;
        stack?: string;
      };
    };

const JAVASCRIPT_ASSERTION_WORKER_SOURCE = `
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { parentPort } = require('node:worker_threads');

function isCjsInEsmError(message) {
  const cjsPatterns = [
    'require is not defined',
    'module is not defined',
    'exports is not defined',
    '__dirname is not defined',
    '__filename is not defined',
    'Cannot use import statement',
    'ERR_REQUIRE_ESM',
  ];
  return cjsPatterns.some((pattern) => message.includes(pattern));
}

function loadCjsModule(modulePath) {
  const code = fs.readFileSync(modulePath, 'utf8');
  const dirname = path.dirname(modulePath);
  const moduleRequire = createRequire(pathToFileURL(modulePath).href);
  const moduleObj = { exports: {} };
  const context = vm.createContext({
    module: moduleObj,
    exports: moduleObj.exports,
    require: moduleRequire,
    __dirname: dirname,
    __filename: modulePath,
    console,
    process,
    Buffer,
    setTimeout,
    setInterval,
    setImmediate,
    clearTimeout,
    clearInterval,
    clearImmediate,
    queueMicrotask,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    fetch: globalThis.fetch,
    Request: globalThis.Request,
    Response: globalThis.Response,
    Headers: globalThis.Headers,
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    Event: globalThis.Event,
    EventTarget: globalThis.EventTarget,
    Error,
    TypeError,
    ReferenceError,
    SyntaxError,
    RangeError,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Symbol,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Proxy,
    Reflect,
    JSON,
    Math,
    Date,
    RegExp,
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
    DataView,
    ArrayBuffer,
    SharedArrayBuffer: globalThis.SharedArrayBuffer,
    Atomics: globalThis.Atomics,
    BigInt,
    eval: undefined,
    Function,
    isNaN,
    isFinite,
    parseFloat,
    parseInt,
    decodeURI,
    decodeURIComponent,
    encodeURI,
    encodeURIComponent,
  });
  vm.runInContext(code, context, { filename: modulePath });
  return moduleObj.exports;
}

async function importModuleWithFallback(modulePath) {
  try {
    const importedModule = await import(pathToFileURL(modulePath).toString());
    return importedModule?.default?.default || importedModule?.default || importedModule;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (modulePath.endsWith('.js') && isCjsInEsmError(errorMessage)) {
      return loadCjsModule(modulePath);
    }
    throw err;
  }
}

function resolveExportedFunction(requiredModule, filePath, functionName) {
  if (functionName && typeof requiredModule?.[functionName] === 'function') {
    return requiredModule[functionName];
  }
  if (typeof requiredModule === 'function') {
    return requiredModule;
  }
  if (requiredModule?.default && typeof requiredModule.default === 'function') {
    return requiredModule.default;
  }
  throw new Error(
    'Assertion malformed: ' +
      filePath +
      ' must export a function or have a default export as a function',
  );
}

function getProcessShim() {
  const processShim = Object.create(process);
  if (!processShim.mainModule || typeof processShim.mainModule.require !== 'function') {
    processShim.mainModule = { require };
  }
  return processShim;
}

async function runRequest(request) {
  switch (request.mode) {
    case 'inline': {
      const customFunction = new Function('output', 'context', 'process', request.functionBody);
      return customFunction(request.output, request.context, getProcessShim());
    }
    case 'function': {
      const evaluatedFunction = new Function(
        'return (' + request.functionSource + ')',
      )();
      if (typeof evaluatedFunction !== 'function') {
        throw new Error('JavaScript assertion function source did not evaluate to a function');
      }
      return evaluatedFunction(request.output, request.context);
    }
    case 'file': {
      const requiredModule = await importModuleWithFallback(request.filePath);
      const exportedFunction = resolveExportedFunction(
        requiredModule,
        request.filePath,
        request.functionName,
      );
      return exportedFunction(request.output, request.context);
    }
    default:
      throw new Error('Unknown javascript assertion worker mode');
  }
}

parentPort.on('message', async (request) => {
  try {
    const result = await Promise.resolve(runRequest(request));
    parentPort.postMessage({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    parentPort.postMessage({ ok: false, error: { message, stack } });
  }
});
`;

/**
 * Converts a value to a worker-safe (structuredClone-compatible) form.
 * Primitives pass through directly. Objects are round-tripped through JSON
 * to strip functions, circular references, and other non-transferable values.
 */
function toWorkerValue(value: unknown): unknown {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  const serialized = safeJsonStringify(value);
  if (!serialized) {
    return undefined;
  }

  try {
    return JSON.parse(serialized);
  } catch {
    return undefined;
  }
}

function buildWorkerContext(assertionValueContext: AssertionParams['assertionValueContext']) {
  const provider = assertionValueContext.provider
    ? {
        id:
          typeof assertionValueContext.provider.id === 'function'
            ? assertionValueContext.provider.id()
            : assertionValueContext.provider.id,
        label: assertionValueContext.provider.label,
        config: toWorkerValue(assertionValueContext.provider.config),
      }
    : undefined;

  return {
    prompt: assertionValueContext.prompt,
    vars: toWorkerValue(assertionValueContext.vars) || {},
    test: toWorkerValue(assertionValueContext.test) || {},
    logProbs: toWorkerValue(assertionValueContext.logProbs),
    config: toWorkerValue(assertionValueContext.config),
    provider,
    providerResponse: toWorkerValue(assertionValueContext.providerResponse),
    trace: toWorkerValue(assertionValueContext.trace),
  };
}

function parseJavascriptFileReference(renderedValue: string): {
  filePath: string;
  functionName?: string;
} {
  const fileRef = renderedValue.slice('file://'.length);
  let filePath = fileRef;
  let functionName: string | undefined;

  if (fileRef.includes(':')) {
    const [pathPart, funcPart] = fileRef.split(':');
    filePath = pathPart;
    functionName = funcPart;
  }

  const basePath = cliState.basePath || '';
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(basePath, filePath);
  return { filePath: resolvedPath, functionName };
}

function runJavascriptInWorker(
  request: JavascriptWorkerRequest,
  timeoutMs: number | undefined,
  abortSignal: AbortSignal | undefined,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: NodeJS.Timeout | undefined;

    const worker = new Worker(JAVASCRIPT_ASSERTION_WORKER_SOURCE, { eval: true });

    function cleanup(): void {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
    }

    function settleWith(fn: () => void): void {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      fn();
    }

    function terminateAndReject(error: Error): void {
      settleWith(() => {
        void worker.terminate();
        reject(error);
      });
    }

    function onAbort(): void {
      terminateAndReject(new Error('Javascript assertion aborted'));
    }

    worker.on('message', (message: JavascriptWorkerResponse) => {
      if (message.ok) {
        settleWith(() => {
          void worker.terminate();
          resolve(message.result);
        });
      } else {
        terminateAndReject(new Error(message.error.stack || message.error.message));
      }
    });

    worker.on('error', (error) => {
      settleWith(() => reject(error));
    });

    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        settleWith(() =>
          reject(new Error(`Javascript assertion worker stopped with exit code ${code}`)),
        );
      }
    });

    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort();
        return;
      }
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }

    if ((timeoutMs ?? 0) > 0) {
      timeoutId = setTimeout(() => {
        terminateAndReject(new Error(`Javascript assertion timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    worker.postMessage(request);
  });
}

export async function handleJavascript({
  assertion,
  renderedValue,
  valueFromScript,
  assertionValueContext,
  outputString,
  output,
  inverse,
  timeoutMs,
  abortSignal,
}: AssertionParams): Promise<GradingResult> {
  let pass;
  let score;
  try {
    const shouldUseIsolatedRuntime = Boolean(abortSignal) || (timeoutMs ?? 0) > 0;
    const workerContext = shouldUseIsolatedRuntime ? buildWorkerContext(assertionValueContext) : {};

    if (typeof assertion.value === 'function') {
      let ret: boolean | number | GradingResult;
      if (shouldUseIsolatedRuntime) {
        const workerResult = await runJavascriptInWorker(
          {
            mode: 'function',
            functionSource: assertion.value.toString(),
            output: outputString,
            context: workerContext,
          },
          timeoutMs,
          abortSignal,
        );
        ret = await validateResult(workerResult);
      } else {
        ret = await validateResult(assertion.value(outputString, assertionValueContext));
      }

      if (typeof ret === 'object') {
        if (!ret.assertion) {
          const functionString = assertion.value.toString();
          ret.assertion = {
            type: 'javascript',
            value:
              functionString.length > 50 ? functionString.slice(0, 50) + '...' : functionString,
          };
        }
        return ret;
      }

      if (typeof ret === 'boolean') {
        pass = ret !== inverse;
        score = pass ? 1 : 0;
      } else {
        pass = assertion.threshold !== undefined ? ret >= assertion.threshold : ret > 0;
        score = ret;
      }
      return {
        pass,
        score,
        reason: pass
          ? 'Assertion passed'
          : `Custom function returned ${inverse ? 'true' : 'false'}`,
        assertion,
      };
    }
    invariant(typeof renderedValue === 'string', 'javascript assertion must have a string value');

    // Trim trailing whitespace/newlines from YAML block scalars (e.g. value: |)
    renderedValue = renderedValue.trimEnd();

    let result: boolean | number | GradingResult;
    if (typeof valueFromScript === 'undefined') {
      // Multiline assertions use the value as-is (user controls returns)
      // Single-line assertions get processed to handle variable declarations
      const functionBody = renderedValue.includes('\n')
        ? renderedValue
        : buildFunctionBody(renderedValue);

      if (shouldUseIsolatedRuntime) {
        const request: JavascriptWorkerRequest = renderedValue.startsWith('file://')
          ? {
              mode: 'file',
              ...parseJavascriptFileReference(renderedValue),
              output: toWorkerValue(output),
              context: workerContext,
            }
          : {
              mode: 'inline',
              functionBody,
              output: toWorkerValue(output),
              context: workerContext,
            };
        const workerResult = await runJavascriptInWorker(request, timeoutMs, abortSignal);
        result = await validateResult(workerResult);
      } else {
        // Pass process shim for ESM compatibility - allows process.mainModule.require to work
        const customFunction = new Function('output', 'context', 'process', functionBody);
        result = await validateResult(
          customFunction(output, assertionValueContext, getProcessShim()),
        );
      }
    } else {
      invariant(
        typeof valueFromScript === 'boolean' ||
          typeof valueFromScript === 'number' ||
          typeof valueFromScript === 'object',
        `Javascript assertion script must return a boolean, number, or object (${assertion.value})`,
      );
      result = await validateResult(valueFromScript);
    }

    if (typeof result === 'boolean') {
      pass = result !== inverse;
      score = pass ? 1 : 0;
    } else if (typeof result === 'number') {
      pass = assertion.threshold !== undefined ? result >= assertion.threshold : result > 0;
      score = result;
    } else if (typeof result === 'object') {
      return result;
    } else {
      throw new Error('Custom function must return a boolean or number');
    }
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Custom function threw error: ${(err as Error).message}
Stack Trace: ${(err as Error).stack}
${renderedValue}`,
      assertion,
    };
  }
  return {
    pass,
    score,
    reason: pass
      ? 'Assertion passed'
      : `Custom function returned ${inverse ? 'true' : 'false'}
${renderedValue}`,
    assertion,
  };
}
