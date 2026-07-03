import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import Clone from 'rfdc';
import cliState from '../cliState';
import { importModule } from '../esm';
import { type Assertion, type TestCase } from '../types/index';
import { loadYaml } from '../util/yamlLoad';

const clone = Clone();

function getPathRedactionCandidates(filePath: string): Array<{ bounded: boolean; value: string }> {
  const normalizedPath = path.normalize(filePath);
  const basename = path.basename(filePath);
  const normalizedBasename = path.basename(normalizedPath);
  const candidates = new Map<string, boolean>([
    [filePath, false],
    [normalizedPath, false],
    [path.dirname(filePath), false],
    [path.dirname(normalizedPath), false],
    ...(basename.length >= 3 ? ([[basename, true]] as const) : []),
    ...(normalizedBasename.length >= 3 ? ([[normalizedBasename, true]] as const) : []),
  ]);
  try {
    candidates.set(pathToFileURL(normalizedPath).toString(), false);
  } catch {
    // Non-standard paths are still covered by the plain and normalized forms.
  }

  const roots = new Set([path.parse(filePath).root, path.parse(normalizedPath).root, '.', '']);
  return [...candidates]
    .filter(([candidate]) => !roots.has(candidate))
    .map(([value, bounded]) => ({ bounded, value }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactPathsAndIdentifierFromText(
  text: string,
  filePaths: string[],
  identifier: string | undefined,
  pathReplacement: string = '[redacted path]',
  identifierReplacement: string = '[redacted identifier]',
): string {
  const replacements = new Map<string, { bounded: boolean; replacement: string }>();
  for (const filePath of filePaths) {
    for (const candidate of getPathRedactionCandidates(filePath)) {
      if (!replacements.has(candidate.value)) {
        replacements.set(candidate.value, {
          bounded: candidate.bounded,
          replacement: pathReplacement,
        });
      }
    }
  }
  if (identifier && !replacements.has(identifier)) {
    replacements.set(identifier, { bounded: true, replacement: identifierReplacement });
  }

  const patterns = [...replacements]
    .sort(([left], [right]) => right.length - left.length)
    .map(([value, entry]) =>
      entry.bounded
        ? `(?<![A-Za-z0-9_$])${escapeRegExp(value)}(?![A-Za-z0-9_$])`
        : escapeRegExp(value),
    );
  return patterns.length === 0
    ? text
    : text.replace(
        new RegExp(patterns.join('|'), 'g'),
        (match) => replacements.get(match)?.replacement ?? match,
      );
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
  options: { redactPath?: boolean; redactPathAliases?: string[] } = {},
  // biome-ignore lint/suspicious/noExplicitAny: I think this is hotloading JS
): Promise<any> {
  const loadModule = () => importModule(filePath, functionName);
  const requiredModule = options.redactPath
    ? await (cliState.withLogRedaction
        ? cliState.withLogRedaction(
            (message) =>
              redactPathsAndIdentifierFromText(
                message,
                [filePath, ...(options.redactPathAliases || [])],
                functionName,
                '[redacted module path]',
                '[redacted module export]',
              ),
            loadModule,
          )
        : loadModule())
    : await loadModule();
  if (functionName && typeof requiredModule[functionName] === 'function') {
    return requiredModule[functionName](...args);
  } else if (typeof requiredModule === 'function') {
    return requiredModule(...args);
  } else if (requiredModule.default && typeof requiredModule.default === 'function') {
    return requiredModule.default(...args);
  } else {
    throw new Error(
      `Assertion malformed: ${options.redactPath ? '[redacted module path]' : filePath} must export a function or have a default export as a function`,
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
