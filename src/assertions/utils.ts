import fs from 'fs';
import path from 'path';

import Clone from 'rfdc';
import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import { isPackagePath, loadFromPackage } from '../providers/packageParser';
import { runPython } from '../python/pythonUtils';
import { isJavascriptFile } from '../util/fileExtensions';
import { loadYaml } from '../util/yamlLoad';

import type {
  Assertion,
  AssertionParams,
  AssertionValue,
  AssertionValueFunctionContext,
  GradingResult,
  ProviderResponse,
  TestCase,
} from '../types/index';

const clone = Clone();

export function getFinalTest(test: TestCase, assertion: Assertion) {
  // Deep copy
  const ret = clone({
    ...test,
    ...(test.options &&
      test.options.provider && {
        options: {
          ...test.options,
          provider: undefined,
        },
      }),
    ...(test.provider && {
      provider: undefined,
    }),
  });

  // rfdc omits symbol keys, including loaded-media metadata used by graders.
  // Clone their values too so assertions retain independent variable ownership.
  if (test.vars && ret.vars) {
    for (const key of Object.getOwnPropertySymbols(test.vars)) {
      if (Object.prototype.propertyIsEnumerable.call(test.vars, key)) {
        Object.defineProperty(ret.vars, key, {
          value: clone(Reflect.get(test.vars, key)),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
  }

  // Assertion provider overrides test provider
  ret.options = ret.options || {};
  // NOTE: Clone does not copy functions so we set the provider again
  if (test.provider) {
    ret.provider = test.provider;
  }
  ret.options.provider = assertion.provider || test?.options?.provider;
  ret.options.rubricPrompt = assertion.rubricPrompt || ret.options.rubricPrompt;
  return Object.freeze(ret);
}

export async function loadFromJavaScriptFile(
  filePath: string,
  functionName: string | undefined,
  args: unknown[],
  // biome-ignore lint/suspicious/noExplicitAny: I think this is hotloading JS
): Promise<any> {
  const requiredModule = await importModule(filePath, functionName);
  if (functionName && typeof requiredModule[functionName] === 'function') {
    return requiredModule[functionName](...args);
  } else if (typeof requiredModule === 'function') {
    return requiredModule(...args);
  } else if (requiredModule.default && typeof requiredModule.default === 'function') {
    return requiredModule.default(...args);
  } else {
    throw new Error(
      `Assertion malformed: ${filePath} must export a function or have a default export as a function`,
    );
  }
}

export function processFileReference(fileRef: string): object | string {
  const basePath = cliState.basePath || '';
  const filePath = path.resolve(basePath, fileRef.slice('file://'.length));
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const extension = path.extname(filePath);
  if (['.json', '.yaml', '.yml'].includes(extension)) {
    return loadYaml(fileContent) as object;
  } else if (extension === '.txt') {
    return fileContent.trim();
  } else {
    throw new Error(`Unsupported file type: ${filePath}`);
  }
}

export function coerceString(value: string | object): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

/** File and package assertion values can execute code that needs assertion context. */
export function isExternalAssertionValue(value: unknown): value is string {
  return typeof value === 'string' && (value.startsWith('file://') || isPackagePath(value));
}

/** Resolve trusted external assertion values identically during and after an attack. */
export async function resolveExternalAssertionValue(
  assertion: Assertion,
  output: ProviderResponse['output'],
  context: AssertionValueFunctionContext,
  baseType: string,
): Promise<{
  renderedValue?: AssertionValue;
  valueFromScript?: AssertionParams['valueFromScript'];
  errorResult?: GradingResult;
}> {
  type ValueFromScriptType = NonNullable<AssertionParams['valueFromScript']> | undefined;
  let renderedValue = assertion.value;
  let valueFromScript: ValueFromScriptType;
  if (typeof renderedValue === 'string') {
    if (renderedValue.startsWith('file://')) {
      const basePath = cliState.basePath || '';
      const fileRef = renderedValue.slice('file://'.length);
      let filePath = fileRef;
      let functionName: string | undefined;

      if (fileRef.includes(':')) {
        const colonIndex = fileRef.indexOf(':');
        filePath = fileRef.slice(0, colonIndex);
        functionName = fileRef.slice(colonIndex + 1);
      }

      filePath = path.resolve(basePath, filePath);

      if (isJavascriptFile(filePath)) {
        valueFromScript = await loadFromJavaScriptFile(filePath, functionName, [output, context]);
        logger.debug(`Javascript script ${filePath} output: ${valueFromScript}`);
      } else if (filePath.endsWith('.py')) {
        try {
          const pythonScriptOutput = await runPython<ValueFromScriptType>(
            filePath,
            functionName || 'get_assert',
            [output, context],
          );
          valueFromScript = pythonScriptOutput;
          logger.debug(`Python script ${filePath} output: ${valueFromScript}`);
        } catch (error) {
          return {
            errorResult: {
              pass: false,
              score: 0,
              reason: (error as Error).message,
              assertion,
            },
          };
        }
      } else if (filePath.endsWith('.rb')) {
        try {
          const { runRuby } = await import('../ruby/rubyUtils.js');
          const rubyScriptOutput = await runRuby<ValueFromScriptType>(
            filePath,
            functionName || 'get_assert',
            [output, context],
          );
          valueFromScript = rubyScriptOutput;
          logger.debug(`Ruby script ${filePath} output: ${valueFromScript}`);
        } catch (error) {
          return {
            errorResult: {
              pass: false,
              score: 0,
              reason: (error as Error).message,
              assertion,
            },
          };
        }
      } else {
        renderedValue = processFileReference(renderedValue);
      }
    } else if (isPackagePath(renderedValue)) {
      const basePath = cliState.basePath || '';
      const requiredModule = await loadFromPackage(renderedValue, basePath);
      if (typeof requiredModule !== 'function') {
        throw new Error(
          `Assertion malformed: ${renderedValue} must be a function. Received: ${typeof requiredModule}`,
        );
      }

      valueFromScript = await Promise.resolve(requiredModule(output, context));
    }
  }

  // Centralized script output resolution
  // Script assertion types (javascript, python, ruby) interpret renderedValue as code to execute
  // All other types should use the script output as the comparison value
  const SCRIPT_RESULT_ASSERTIONS = new Set(['javascript', 'python', 'ruby']);

  if (valueFromScript !== undefined && !SCRIPT_RESULT_ASSERTIONS.has(baseType)) {
    // Validate the script result type - only javascript/python/ruby can return functions
    if (typeof valueFromScript === 'function') {
      throw new Error(
        `Script for "${assertion.type}" assertion returned a function. ` +
          `Only javascript/python/ruby assertion types can return functions. ` +
          `For other assertion types, return the expected value (string, number, array, or object).`,
      );
    }

    // Validate the script didn't return boolean or GradingResult
    // These are only valid for javascript/python/ruby assertion types
    if (typeof valueFromScript === 'boolean') {
      throw new Error(
        `Script for "${assertion.type}" assertion returned a boolean. ` +
          `Only javascript/python/ruby assertion types can return boolean values. ` +
          `For other assertion types, return the expected value (string, number, array, or object).`,
      );
    }

    // Check if it's a GradingResult object (has 'pass' property)
    if (
      valueFromScript &&
      typeof valueFromScript === 'object' &&
      !Array.isArray(valueFromScript) &&
      'pass' in valueFromScript
    ) {
      throw new Error(
        `Script for "${assertion.type}" assertion returned a GradingResult. ` +
          `Only javascript/python/ruby assertion types can return GradingResult objects. ` +
          `For other assertion types, return the expected value (string, number, array, or object).`,
      );
    }

    // Update renderedValue with the script output
    // Type assertion is now safe because we've validated the type
    renderedValue = valueFromScript as AssertionValue;
  }

  return { renderedValue, valueFromScript };
}
