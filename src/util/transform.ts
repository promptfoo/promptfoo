import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import { runPython } from '../python/pythonUtils';
import { isJavascriptFile } from './fileExtensions';
import { safeJoin } from './pathUtils';
import { getProcessShim } from './processShim';

import type { Vars } from '../types/index';
import type { TransformContext, TransformFunction } from '../types/transform';

/** Label used in error messages when a transform is an inline function rather than a string. */
export const INLINE_FUNCTION_LABEL = '[inline function]';
/** Label used in error messages when a transform is an inline string expression. */
export const INLINE_STRING_LABEL = '[inline transform]';
/** Label used in error messages when a transform is loaded from a file reference. */
export const FILE_TRANSFORM_LABEL = '[file transform]';
/** Maximum length of an inline transform string shown in error labels before truncation. */
const INLINE_STRING_LABEL_MAX_LENGTH = 80;

export const TransformInputType = {
  OUTPUT: 'output',
  VARS: 'vars',
} as const;
export type TransformInputType = (typeof TransformInputType)[keyof typeof TransformInputType];

/**
 * Parses a file path string to extract the file path and function name.
 * Handles Windows drive letters (e.g., C:\path\to\file.js:functionName).
 * @param filePath - The file path string, potentially including a function name.
 * @returns A tuple containing the file path and function name (if present).
 */
function parseFilePathAndFunctionName(filePath: string): [string, string | undefined] {
  const lastColonIndex = filePath.lastIndexOf(':');
  // Check if colon is part of Windows drive letter (position 1) or not present
  if (lastColonIndex > 1) {
    return [filePath.slice(0, lastColonIndex), filePath.slice(lastColonIndex + 1)];
  }
  return [filePath, undefined];
}

/**
 * Retrieves a JavaScript transform function from a file.
 * @param filePath - The path to the JavaScript file.
 * @param functionName - Optional name of the function to retrieve.
 * @returns A Promise resolving to the requested function.
 * @throws Error if the file doesn't export a valid function.
 */
async function getJavascriptTransformFunction(
  filePath: string,
  functionName?: string,
): Promise<Function> {
  const requiredModule = await importModule(filePath);

  // Validate that functionName is an own property to prevent prototype pollution attacks
  if (
    functionName &&
    Object.prototype.hasOwnProperty.call(requiredModule, functionName) &&
    typeof requiredModule[functionName] === 'function'
  ) {
    return requiredModule[functionName];
  } else if (typeof requiredModule === 'function') {
    return requiredModule;
  } else if (requiredModule.default && typeof requiredModule.default === 'function') {
    return requiredModule.default;
  }
  throw new Error(
    `Transform ${filePath} must export a function, have a default export as a function, or export the specified function "${functionName}"`,
  );
}

/**
 * Creates a function that runs a Python transform function.
 * @param filePath - The path to the Python file.
 * @param functionName - The name of the function to run (defaults to 'get_transform').
 * @returns A function that executes the Python transform.
 */
function getPythonTransformFunction(
  filePath: string,
  functionName: string = 'get_transform',
): Function {
  return async (output: string, context: { vars: Vars }) => {
    return runPython(filePath, functionName, [output, context]);
  };
}

/**
 * Retrieves a transform function from a file, supporting both JavaScript and Python.
 * @param filePath - The path to the file, including the 'file://' prefix.
 * @returns A Promise resolving to the requested function.
 * @throws Error if the file format is unsupported.
 */
async function getFileTransformFunction(filePath: string): Promise<Function> {
  const [actualFilePath, functionName] = parseFilePathAndFunctionName(
    filePath.slice('file://'.length),
  );

  const fullPath = safeJoin(cliState.basePath || '', actualFilePath);

  if (isJavascriptFile(fullPath)) {
    return getJavascriptTransformFunction(fullPath, functionName);
  } else if (fullPath.endsWith('.py')) {
    return getPythonTransformFunction(fullPath, functionName);
  }
  throw new Error(`Unsupported transform file format: file://${actualFilePath}`);
}

/**
 * Creates a function from inline JavaScript code.
 * @param code - The JavaScript code to convert into a function.
 * @returns A Function created from the provided code.
 *
 * The function receives three parameters:
 * - The input (output or vars depending on inputType)
 * - A context object
 * - A process object with mainModule.require shimmed for backwards compatibility
 *
 * To use require in inline transforms, use: process.mainModule.require('module-name')
 * Or assign it to a variable: const require = process.mainModule.require;
 */
function getInlineTransformFunction(code: string, inputType: TransformInputType): Function {
  return new Function(
    inputType,
    'context',
    'process',
    code.includes('\n') ? code : `return ${code}`,
  );
}

/**
 * Determines and retrieves the appropriate transform function based on the input.
 * @param codeOrFilepath - Either inline code or a file path starting with 'file://'.
 * @returns A Promise resolving to the appropriate transform function.
 */
async function getTransformFunction(
  codeOrFilepath: string,
  inputType: TransformInputType,
): Promise<Function | null> {
  let transformFn: Function | null = null;
  if (codeOrFilepath.startsWith('file://')) {
    try {
      transformFn = await getFileTransformFunction(codeOrFilepath);
    } catch (error) {
      logger.error(
        `Error loading transform function from file: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  } else {
    try {
      transformFn = getInlineTransformFunction(codeOrFilepath, inputType);
    } catch (error) {
      logger.error(
        `Error creating inline transform function: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
  return transformFn;
}

/**
 * Returns a human-readable label for a transform value, suitable for error messages.
 *
 * Inline string transforms are shown verbatim (single-line, truncated to
 * {@link INLINE_STRING_LABEL_MAX_LENGTH}) so users can see which expression failed.
 * Inline functions are shown by name only — their source is never rendered, to avoid
 * leaking implementation details via `Function.toString()` into logs and persisted errors.
 */
export function getTransformLabel(t: string | TransformFunction | null | undefined): string {
  if (t == null) {
    return INLINE_STRING_LABEL;
  }
  if (typeof t === 'function') {
    return t.name ? `${INLINE_FUNCTION_LABEL}: ${t.name}` : INLINE_FUNCTION_LABEL;
  }
  if (t.startsWith('file://')) {
    return FILE_TRANSFORM_LABEL;
  }
  const singleLine = t.replace(/\s+/g, ' ').trim();
  const truncated =
    singleLine.length > INLINE_STRING_LABEL_MAX_LENGTH
      ? `${singleLine.slice(0, INLINE_STRING_LABEL_MAX_LENGTH - 1)}…`
      : singleLine;
  return `${INLINE_STRING_LABEL}: ${truncated}`;
}

/**
 * Transforms the output using a specified function, inline code, or file reference.
 *
 * @param codeOrFilepathOrFn - A TransformFunction, inline JavaScript code, or a file path
 * starting with 'file://'. File paths can include a function name
 * (e.g., 'file://transform.js:myFunction'). Python files default to 'get_transform'.
 * @param transformInput - The input to transform. Can be a string, object, or undefined.
 * @param context - Context object passed to the transform function (vars, prompt, metadata).
 * @param validateReturn - If true (default), throws when the transform returns null/undefined.
 * @param inputType - Whether the first parameter is named 'output' or 'vars' in inline code.
 * @returns A promise that resolves to the transformed output.
 */
export async function transform(
  codeOrFilepathOrFn: string | TransformFunction,
  transformInput: string | object | undefined,
  context: TransformContext,
  validateReturn: boolean = true,
  inputType: TransformInputType = TransformInputType.OUTPUT,
): Promise<any> {
  const isDirectFunction = typeof codeOrFilepathOrFn === 'function';
  const transformFn = isDirectFunction
    ? codeOrFilepathOrFn
    : await getTransformFunction(codeOrFilepathOrFn, inputType);

  if (!transformFn) {
    throw new Error(`Invalid transform function for ${getTransformLabel(codeOrFilepathOrFn)}`);
  }

  let ret: unknown;
  try {
    ret = isDirectFunction
      ? await Promise.resolve(transformFn(transformInput, context))
      : await Promise.resolve(transformFn(transformInput, context, getProcessShim()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `Error in transform function (${getTransformLabel(codeOrFilepathOrFn)}): ${message}`,
    );
    throw error;
  }

  if (validateReturn && (ret === null || ret === undefined)) {
    throw new Error(
      `Transform function did not return a value\n\n${getTransformLabel(codeOrFilepathOrFn)}`,
    );
  }

  return ret;
}
