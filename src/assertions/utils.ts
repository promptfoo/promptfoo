import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import Clone from 'rfdc';
import cliState from '../cliState';
import { importModule } from '../esm';
import { type Assertion, type TestCase } from '../types';
import { loadFile } from '../util/fileLoader';

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
  args: any[],
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

export async function processFileReference(fileRef: string): Promise<object | string> {
  const basePath = cliState.basePath || '';
  const filePath = fileRef.slice('file://'.length);
  const fileContent = await loadFile(filePath, { basePath });
  
  // If fileContent is already an object, return it
  if (typeof fileContent !== 'string') {
    return fileContent;
  }
  
  // For string content, check if it's a txt file which should be returned as-is
  const extension = path.extname(filePath);
  if (extension === '.txt') {
    return fileContent.trim();
  }
  
  return fileContent;
}

export function coerceString(value: string | object): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}
