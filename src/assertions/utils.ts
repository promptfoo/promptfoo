import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import Clone from 'rfdc';
import cliState from '../cliState';
import { importModule } from '../esm';
import { type Assertion, type TestCase } from '../types/index';

const clone = Clone();

const JSON_SCHEMA_FILE_SNAPSHOT = Symbol.for('promptfoo.jsonSchemaFileSnapshot');
const JSON_SCHEMA_RENDERED_FILE_REF = Symbol.for('promptfoo.jsonSchemaRenderedFileRef');
const JSON_SCHEMA_FILE_ERROR = '__promptfooJsonSchemaFileError';
const JSON_SCHEMA_FILE_FORMAT = '__promptfooJsonSchemaFileFormat';
const JSON_SCHEMA_FILE_ERRORS = new Set([
  'schema file must contain an object or boolean schema',
  'schema file not found',
  'invalid JSON schema file',
  'invalid YAML schema file',
  'schema file could not be read',
]);
const JSON_SCHEMA_FILE_FINGERPRINT = /^sha256:[a-f0-9]{64}$/;
const WIN32_DRIVE_PREFIX = /^\/[A-Za-z]:[\\/]/;

type PersistedJsonSchemaFileError = {
  error: string;
  fingerprint: string;
};

export type JsonSchemaFileSnapshot =
  | {
      source: string;
      format: 'parsed' | 'text';
      schema: unknown;
    }
  | {
      source: string;
      error: string;
      fingerprint: string;
    };

function isJsonSchemaAssertionRecord(record: Record<PropertyKey, unknown>): boolean {
  if (typeof record.type !== 'string') {
    return false;
  }
  const baseType = record.type.replace(/^not-/, '');
  return baseType === 'is-json' || baseType === 'contains-json';
}

function isPersistedJsonSchemaFileError(value: unknown): value is PersistedJsonSchemaFileError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PersistedJsonSchemaFileError).error === 'string' &&
    JSON_SCHEMA_FILE_ERRORS.has((value as PersistedJsonSchemaFileError).error) &&
    typeof (value as PersistedJsonSchemaFileError).fingerprint === 'string' &&
    JSON_SCHEMA_FILE_FINGERPRINT.test((value as PersistedJsonSchemaFileError).fingerprint)
  );
}

export function getJsonSchemaFileSnapshot(assertion: unknown): JsonSchemaFileSnapshot | undefined {
  if (typeof assertion !== 'object' || assertion === null) {
    return undefined;
  }
  const record = assertion as Record<PropertyKey, unknown>;
  if (!isJsonSchemaAssertionRecord(record)) {
    return undefined;
  }
  const snapshot = record[JSON_SCHEMA_FILE_SNAPSHOT] as JsonSchemaFileSnapshot | undefined;
  if (snapshot) {
    return snapshot;
  }
  const persisted = record[JSON_SCHEMA_FILE_ERROR];
  if (
    isPersistedJsonSchemaFileError(persisted) &&
    typeof record.value === 'string' &&
    record.value.startsWith('file://')
  ) {
    const { error, fingerprint } = persisted;
    return { source: `persisted:${fingerprint}`, error, fingerprint };
  }
  if (record[JSON_SCHEMA_FILE_FORMAT] === 'text' && typeof record.value === 'string') {
    return {
      source: 'persisted:text',
      format: 'text',
      schema: record.value,
    };
  }
  return undefined;
}

export function getJsonSchemaRenderedFileRef(assertion: unknown): string | undefined {
  if (typeof assertion !== 'object' || assertion === null) {
    return undefined;
  }
  const record = assertion as Record<PropertyKey, unknown>;
  if (
    !isJsonSchemaAssertionRecord(record) ||
    typeof record.value !== 'string' ||
    !record.value.startsWith('file://')
  ) {
    return undefined;
  }
  const renderedFileRef = record[JSON_SCHEMA_RENDERED_FILE_REF];
  return typeof renderedFileRef === 'string' ? renderedFileRef : undefined;
}

export function loadJsonSchemaFileReference(fileRef: string): JsonSchemaFileSnapshot {
  const filePath = resolveJsonSchemaFileReference(fileRef);
  const extension = path.extname(filePath).toLowerCase();
  if (!['.json', '.yaml', '.yml', '.txt'].includes(extension)) {
    return {
      source: filePath,
      error: 'schema file could not be read',
      fingerprint: '',
    };
  }

  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    const isParsedSchema = extension !== '.txt';
    const schema =
      extension === '.json'
        ? JSON.parse(contents)
        : extension === '.yaml' || extension === '.yml'
          ? yaml.load(contents)
          : contents.trim();
    if (
      (isParsedSchema &&
        (schema === null || (typeof schema !== 'boolean' && typeof schema !== 'object'))) ||
      (!isParsedSchema && /^(?:null|~)?$/i.test(String(schema)))
    ) {
      return {
        source: filePath,
        error: 'schema file must contain an object or boolean schema',
        fingerprint: '',
      };
    }
    return {
      source: filePath,
      format: isParsedSchema ? 'parsed' : 'text',
      schema,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const safeError =
      code === 'ENOENT'
        ? 'schema file not found'
        : error instanceof SyntaxError && extension === '.json'
          ? 'invalid JSON schema file'
          : error instanceof yaml.YAMLException
            ? 'invalid YAML schema file'
            : 'schema file could not be read';
    return { source: filePath, error: safeError, fingerprint: '' };
  }
}

export function resolveJsonSchemaFileReference(fileRef: string): string {
  let relativePath = fileRef.slice('file://'.length);
  if (process.platform === 'win32' && WIN32_DRIVE_PREFIX.test(relativePath)) {
    relativePath = relativePath.slice(1);
  }
  return path.resolve(cliState.basePath || '', relativePath);
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
