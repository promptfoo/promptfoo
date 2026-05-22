import path from 'node:path';
import { Worker } from 'node:worker_threads';

import cliState from '../cliState';
import { type GradingResult, isGradingResult } from '../types/index';
import { parseFileUrl } from '../util/functions/loadFunction';
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

function serializeInvalidResult(result: unknown): string {
  const serialized = safeJsonStringify(result);
  if (serialized !== undefined) {
    return serialized;
  }

  try {
    return String(result);
  } catch {
    return '<unserializable>';
  }
}

const validateResult = async (result: unknown): Promise<boolean | number | GradingResult> => {
  result = await Promise.resolve(result);
  if (typeof result === 'boolean' || typeof result === 'number' || isGradingResult(result)) {
    return result;
  } else {
    throw new Error(
      `Custom function must return a boolean, number, or GradingResult object. Got type ${typeof result}: ${serializeInvalidResult(result)}`,
    );
  }
};

type JavascriptWorkerRequest =
  | {
      mode: 'inline';
      functionBody: string;
      output: unknown;
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
    const moduleUrl = pathToFileURL(modulePath).toString();
    const importedModule = isTypescriptModulePath(modulePath)
      ? await importTypescriptModule(moduleUrl)
      : await import(moduleUrl);
    return importedModule?.default?.default || importedModule?.default || importedModule;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (modulePath.endsWith('.js') && isCjsInEsmError(errorMessage)) {
      return loadCjsModule(modulePath);
    }
    throw err;
  }
}

function isTypescriptModulePath(modulePath) {
  return /\\.[cm]?ts$/.test(modulePath);
}

async function importTypescriptModule(moduleUrl) {
  const { tsImport } = await import('tsx/esm/api');
  return tsImport(moduleUrl, moduleUrl);
}

function resolveExportedFunction(requiredModule, filePath, functionName) {
  if (functionName) {
    const exported = functionName.split('.').reduce((value, key) => value?.[key], requiredModule);
    if (typeof exported === 'function') {
      return exported;
    }
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

function getWorkerProcessShim() {
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
      return customFunction(request.output, request.context, getWorkerProcessShim());
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

function shimContext(ctx) {
  if (ctx && ctx.provider && typeof ctx.provider.id === 'string') {
    const idValue = ctx.provider.id;
    ctx.provider.id = Object.assign(function () {
      return idValue;
    }, {
      toString: function () {
        return idValue;
      },
      valueOf: function () {
        return idValue;
      },
    });
  }
  return ctx;
}

parentPort.on('message', async (request) => {
  try {
    request.context = shimContext(request.context);
    const result = await Promise.resolve(runRequest(request));
    parentPort.postMessage({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    parentPort.postMessage({ ok: false, error: { message, stack } });
  }
});
`;

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
  const { filePath, functionName } = parseFileUrl(renderedValue);
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

function serializeFunctionAssertion(assertion: AssertionParams['assertion']) {
  invariant(
    typeof assertion.value === 'function',
    `function-valued javascript assertion (type: ${assertion.type}) must have a function value`,
  );
  const functionString = assertion.value.toString();
  return {
    ...assertion,
    value: functionString.length > 50 ? functionString.slice(0, 50) + '...' : functionString,
  };
}

function normalizeResultAssertion(
  assertion: GradingResult['assertion'],
  fallbackAssertion: AssertionParams['assertion'],
) {
  const assertionToNormalize = assertion ?? fallbackAssertion;

  if (typeof assertionToNormalize.value === 'function') {
    return serializeFunctionAssertion(assertionToNormalize);
  }

  return assertionToNormalize;
}

function appendRenderedValueToReason(
  reason: string,
  renderedValue?: AssertionParams['renderedValue'],
): string {
  return typeof renderedValue === 'string' && renderedValue
    ? `${reason}\n${renderedValue}`
    : reason;
}

function normalizeJavascriptAssertionResult(
  assertion: AssertionParams['assertion'],
  result: boolean | number | GradingResult,
  inverse: boolean,
  renderedValue?: string,
): GradingResult {
  const normalizedAssertion = normalizeResultAssertion(undefined, assertion);
  const getFailureReason = (rawPass: boolean) => {
    return appendRenderedValueToReason(
      `Custom function returned ${rawPass ? 'true' : 'false'}`,
      renderedValue,
    );
  };

  if (typeof result === 'boolean') {
    const pass = result !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Assertion passed' : getFailureReason(result),
      assertion: normalizedAssertion,
    };
  }

  if (typeof result === 'number') {
    const rawPass = assertion.threshold === undefined ? result > 0 : result >= assertion.threshold;
    const pass = rawPass !== inverse;
    return {
      pass,
      score: result,
      reason: pass ? 'Assertion passed' : getFailureReason(rawPass),
      assertion: normalizedAssertion,
    };
  }

  const pass = result.pass !== inverse;
  return {
    ...result,
    pass,
    reason:
      pass === result.pass
        ? result.reason
        : pass
          ? 'Assertion passed'
          : `Custom function returned ${result.pass ? 'true' : 'false'}`,
    assertion: normalizeResultAssertion(result.assertion, assertion),
  };
}

export const handleJavascript = async ({
  assertion,
  renderedValue,
  valueFromScript,
  assertionValueContext,
  outputString,
  output,
  inverse,
  timeoutMs,
  abortSignal,
}: AssertionParams): Promise<GradingResult> => {
  try {
    const shouldUseIsolatedRuntime = (timeoutMs ?? 0) > 0;
    const workerContext = shouldUseIsolatedRuntime ? buildWorkerContext(assertionValueContext) : {};

    if (typeof assertion.value === 'function') {
      const result = await validateResult(assertion.value(outputString, assertionValueContext));
      return normalizeJavascriptAssertionResult(assertion, result, inverse);
    }
    invariant(typeof renderedValue === 'string', 'javascript assertion must have a string value');

    /**
     * Removes trailing newline from the rendered value.
     * This is necessary for handling multi-line string literals in YAML
     * that are defined on a single line in the YAML file.
     *
     * @example
     * value: |
     *   output === 'true'
     */
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
        result = await validateResult(await runJavascriptInWorker(request, timeoutMs, abortSignal));
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

    return normalizeJavascriptAssertionResult(assertion, result, inverse, renderedValue);
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: appendRenderedValueToReason(
        `Custom function threw error: ${(err as Error).message}
Stack Trace: ${(err as Error).stack}`,
        renderedValue,
      ),
      assertion: normalizeResultAssertion(undefined, assertion),
    };
  }
};
