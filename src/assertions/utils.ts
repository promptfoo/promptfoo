import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import Clone from 'rfdc';
import cliState from '../cliState';
import { importModule } from '../esm';
import { type Assertion, type ProviderOptions, type TestCase } from '../types/index';

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

  const provider = assertion.provider || test?.options?.provider;
  const temperature = assertion.temperature ?? test?.options?.temperature;

  // If temperature is specified, inject it into the provider options
  if (temperature !== undefined && provider !== undefined) {
    if (typeof provider === 'string') {
      // Convert string provider to ProviderOptions so temperature can be set
      ret.options.provider = { id: provider, config: { temperature } } as ProviderOptions;
    } else if (
      typeof provider === 'object' &&
      !Array.isArray(provider) &&
      'id' in (provider as object)
    ) {
      // ProviderOptions — assertion temperature is the default; explicit config.temperature wins
      const po = provider as ProviderOptions;
      ret.options.provider = {
        ...po,
        config: { temperature, ...(po.config || {}) },
      } as ProviderOptions;
    } else {
      ret.options.provider = provider;
    }
  } else {
    ret.options.provider = provider;
  }

  if (temperature !== undefined) {
    ret.options.temperature = temperature;
  }

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
    return yaml.load(fileContent) as object;
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
