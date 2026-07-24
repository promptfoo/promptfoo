import fs from 'fs';
import path from 'path';

import Clone from 'rfdc';
import cliState from '../cliState';
import { importModule } from '../esm';
import { type Assertion, type GradingConfig, type TestCase, type VarValue } from '../types/index';
import { getNunjucksEngine } from '../util/templates';
import { loadYaml } from '../util/yamlLoad';

const clone = Clone();

/**
 * Render `{{var}}` Nunjucks templates inside string fields of a grading provider's
 * `config` object. Used by `agent-rubric` so users can bind per-test-case paths
 * (e.g. `working_dir: ./evidence/{{trace_id}}`).
 *
 * Only top-level string values inside `config` are rendered — nested objects and
 * arrays are passed through unchanged to avoid surprising behavior. Returns the
 * provider definition unchanged when it's a string, an ApiProvider instance, or
 * has no `config` to render.
 */
export function renderProviderConfigTemplates(
  provider: GradingConfig['provider'],
  vars?: Record<string, VarValue>,
): GradingConfig['provider'] {
  if (!provider || typeof provider !== 'object') {
    return provider;
  }
  // Skip already-constructed ApiProvider instances (they have an `id()` function).
  if (typeof (provider as { id?: unknown }).id === 'function') {
    return provider;
  }
  const cfg = (provider as { config?: Record<string, unknown> }).config;
  if (!cfg || typeof cfg !== 'object') {
    return provider;
  }
  const engine = getNunjucksEngine(undefined, false, true);
  const renderedConfig: Record<string, unknown> = { ...cfg };
  let mutated = false;
  for (const [key, value] of Object.entries(cfg)) {
    if (typeof value !== 'string' || !value.includes('{{')) {
      continue;
    }
    const rendered = engine.renderString(value, vars || {});
    if (rendered !== value) {
      renderedConfig[key] = rendered;
      mutated = true;
    }
  }
  if (!mutated) {
    return provider;
  }
  return { ...(provider as object), config: renderedConfig } as GradingConfig['provider'];
}

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
