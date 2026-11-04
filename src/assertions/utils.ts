import fs from 'fs';
import path from 'path';

import Clone from 'rfdc';
import cliState from '../cliState';
import { importModule } from '../esm';
import { type Assertion, type TestCase } from '../types/index';
import { loadYaml } from '../util/yamlLoad';

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

/**
 * Imports a JavaScript assertion file and returns the function it exports.
 * Throws when the file cannot be loaded or does not export a function.
 */
export async function resolveJavaScriptFileFunction(
  filePath: string,
  functionName: string | undefined,
  // biome-ignore lint/suspicious/noExplicitAny: I think this is hotloading JS
): Promise<(...args: any[]) => any> {
  const requiredModule = await importModule(filePath, functionName);
  if (functionName && typeof requiredModule[functionName] === 'function') {
    return requiredModule[functionName];
  } else if (typeof requiredModule === 'function') {
    return requiredModule;
  } else if (requiredModule.default && typeof requiredModule.default === 'function') {
    return requiredModule.default;
  }
  throw new Error(
    `Assertion malformed: ${filePath} must export a function or have a default export as a function`,
  );
}

export async function loadFromJavaScriptFile(
  filePath: string,
  functionName: string | undefined,
  args: unknown[],
  // biome-ignore lint/suspicious/noExplicitAny: I think this is hotloading JS
): Promise<any> {
  const fn = await resolveJavaScriptFileFunction(filePath, functionName);
  return fn(...args);
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
