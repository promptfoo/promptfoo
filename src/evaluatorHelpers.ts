import { types as utilTypes } from 'node:util';
import fs from 'fs/promises';
import * as path from 'path';

import { isBinary } from 'istextorbinary';
import yaml from 'js-yaml';
import cliState from './cliState';
import { getEnvBool } from './envars';
import { importModule } from './esm';
import { getPrompt as getHeliconePrompt } from './integrations/helicone';
import { getPrompt as getLangfusePrompt } from './integrations/langfuse';
import { getPrompt as getPortkeyPrompt } from './integrations/portkey';
import logger from './logger';
import { isPackagePath, loadFromPackage } from './providers/packageParser';
import { runPython } from './python/pythonUtils';
import telemetry from './telemetry';
import {
  type ApiProvider,
  type CompletedPrompt,
  type EvaluateResult,
  type NunjucksFilterMap,
  type Prompt,
  type TestCase,
  type TestSuite,
  type UnifiedConfig,
  type VarValue,
} from './types/index';
import {
  isAudioFile,
  isImageFile,
  isJavascriptFile,
  isSupportedNestedTextFile,
  isVideoFile,
} from './util/fileExtensions';
import { renderVarsInObject } from './util/index';
import invariant from './util/invariant';
import { filterFiniteScores } from './util/numeric';
import {
  analyzeTemplateReferences,
  extractVariablesFromTemplate,
  getNunjucksEngine,
  templateReferencesVariable,
} from './util/templates';
import { transform } from './util/transform';

type FileMetadata = Record<string, { path: string; type: string; format?: string }>;

export async function extractTextFromPDF(pdfPath: string): Promise<string> {
  logger.debug(`Extracting text from PDF: ${pdfPath}`);
  try {
    const { PDFParse } = await import('pdf-parse');
    const dataBuffer = await fs.readFile(pdfPath);
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text.trim();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot find module 'pdf-parse'")) {
      throw new Error('pdf-parse is not installed. Please install it with: npm install pdf-parse');
    }
    throw new Error(
      `Failed to extract text from PDF ${pdfPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function resolveVariables(
  variables: Record<string, VarValue>,
  skipResolveVars?: string[],
  varsResolvedFromSkipped?: Set<string>,
): Record<string, VarValue> {
  let resolved: boolean;
  const regex = /\{\{\s*(\w+)\s*\}\}/; // Matches {{variableName}}, {{ variableName }}, etc.

  let iterations = 0;
  do {
    resolved = true;
    for (const key of Object.keys(variables)) {
      if (
        skipResolveVars?.includes(key) ||
        varsResolvedFromSkipped?.has(key) ||
        typeof variables[key] !== 'string'
      ) {
        continue;
      }
      const value = variables[key] as string;
      const match = regex.exec(value);
      if (match) {
        const [placeholder, varName] = match;
        if (variables[varName] === undefined) {
          // Do nothing - final nunjucks render will fail if necessary.
          // logger.warn(`Variable "${varName}" not found for substitution.`);
        } else {
          variables[key] = value.replace(placeholder, variables[varName] as string);
          if (skipResolveVars?.includes(varName) || varsResolvedFromSkipped?.has(varName)) {
            varsResolvedFromSkipped?.add(key);
          }
          resolved = false; // Indicate that we've made a replacement and should check again
        }
      }
    }
    iterations++;
  } while (!resolved && iterations < 5);

  return variables;
}

// Utility: Detect partial/unclosed Nunjucks tags and wrap in {% raw %} if needed
function autoWrapRawIfPartialNunjucks(prompt: string): string {
  // Detects any occurrence of an opening Nunjucks tag without a matching close
  // e.g. "{%" or "{{" not followed by a closing "%}" or "}}"
  const hasPartialTag = /({%[^%]*$|{{[^}]*$|{#[^#]*$)/m.test(prompt);
  const alreadyWrapped = /{\%\s*raw\s*\%}/.test(prompt) && /{\%\s*endraw\s*\%}/.test(prompt);
  if (hasPartialTag && !alreadyWrapped) {
    return `{% raw %}${prompt}{% endraw %}`;
  }
  return prompt;
}

function referencesUndefinedVariables(template: string, vars: Record<string, VarValue>): boolean {
  return extractVariablesFromTemplate(template).some((variableName) => {
    const rootVariableName = /^([A-Za-z_]\w*)/.exec(variableName)?.[1];
    return Boolean(
      rootVariableName && rootVariableName !== 'env' && vars[rootVariableName] === undefined,
    );
  });
}

/**
 * True if `template` references any variable that is skipped from rendering
 * (`skipRenderVars`) or was itself resolved from a skipped variable.
 *
 * This is the skip boundary for red team injection vars, so it must catch *every*
 * way a Nunjucks template can reference a symbol — filter (`{{ x | safe }}`),
 * attribute (`{{ x.y }}`), index (`{{ a[x] }}`), whitespace-control (`{{- x -}}`),
 * inline conditional (`{{ x if y }}`), operator (`{{ a ~ x }}`), filter argument
 * (`{{ a | default(x) }}`), block tags, etc. A regex extractor misses several of
 * these, so we use the AST-backed {@link templateReferencesVariable}, which also
 * conservatively reports a reference when the template fails to parse.
 */
function referencesSkippedVariables(
  template: string,
  skipRenderVars: string[] | undefined,
  varsResolvedFromSkipped: Set<string>,
): boolean {
  if (!skipRenderVars?.length && varsResolvedFromSkipped.size === 0) {
    return false;
  }
  const skippedNames = new Set<string>(varsResolvedFromSkipped);
  for (const name of skipRenderVars ?? []) {
    skippedNames.add(name);
  }
  for (const name of skippedNames) {
    if (templateReferencesVariable(template, name)) {
      return true;
    }
  }
  return false;
}

/**
 * Reads the string value of a writable own data property, or undefined if the
 * property is missing, an accessor (getter/setter), non-writable, or not a string.
 * Reading via the descriptor avoids invoking getters while walking nested vars.
 */
function getWritableStringProp(container: object, key: string): string | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  if (
    descriptor &&
    'value' in descriptor &&
    descriptor.writable === true &&
    typeof descriptor.value === 'string'
  ) {
    return descriptor.value;
  }
  return undefined;
}

/**
 * Writes a value to a writable own data property, preserving the existing
 * descriptor flags (enumerable/configurable) and never touching the prototype
 * chain (e.g. an own `__proto__` data property on a null-prototype object).
 */
function setNestedValue(container: object, key: string, value: unknown): void {
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  if (descriptor && 'value' in descriptor && descriptor.writable === true) {
    Object.defineProperty(container, key, { ...descriptor, value });
  }
}

/**
 * Collects metadata about file variables in the vars object.
 * @param vars The variables object containing potential file references
 * @returns An object mapping variable names to their file metadata
 */
export function collectFileMetadata(vars: Record<string, VarValue>): FileMetadata {
  const fileMetadata: FileMetadata = {};

  for (const [varName, value] of Object.entries(vars)) {
    if (typeof value === 'string' && value.startsWith('file://')) {
      const filePath = path.resolve(cliState.basePath || '', value.slice('file://'.length));
      const fileExtension = filePath.split('.').pop() || '';

      if (isImageFile(filePath)) {
        fileMetadata[varName] = {
          path: value, // Keep the original file:// notation
          type: 'image',
          format: fileExtension,
        };
      } else if (isVideoFile(filePath)) {
        fileMetadata[varName] = {
          path: value,
          type: 'video',
          format: fileExtension,
        };
      } else if (isAudioFile(filePath)) {
        fileMetadata[varName] = {
          path: value,
          type: 'audio',
          format: fileExtension,
        };
      }
    }
  }

  return fileMetadata;
}

/** True only for plain objects ({} or Object.create(null)). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

const builtinPrototypeDescriptors = (() => {
  const roots: object[] = [
    Object,
    Object.prototype,
    Array,
    Array.prototype,
    Map,
    Map.prototype,
    Set,
    Set.prototype,
    String,
    String.prototype,
    Number,
    Number.prototype,
    Boolean,
    Boolean.prototype,
    BigInt,
    BigInt.prototype,
    Symbol,
    Symbol.prototype,
    Function,
    Function.prototype,
  ];
  const baselines = new Map<
    object,
    { descriptors: Map<PropertyKey, PropertyDescriptor>; prototype: object | null }
  >();
  const pending = [...roots];
  while (pending.length > 0) {
    const builtinObject = pending.pop()!;
    if (baselines.has(builtinObject)) {
      continue;
    }
    const descriptors = new Map<PropertyKey, PropertyDescriptor>();
    for (const key of Reflect.ownKeys(builtinObject)) {
      const descriptor = Object.getOwnPropertyDescriptor(builtinObject, key);
      if (!descriptor) {
        continue;
      }
      descriptors.set(key, descriptor);
      if ('value' in descriptor && isObjectLike(descriptor.value)) {
        pending.push(descriptor.value);
      } else if (!('value' in descriptor)) {
        if (isObjectLike(descriptor.get)) {
          pending.push(descriptor.get);
        }
        if (isObjectLike(descriptor.set)) {
          pending.push(descriptor.set);
        }
      }
    }
    baselines.set(builtinObject, {
      descriptors,
      prototype: Object.getPrototypeOf(builtinObject),
    });
  }
  return baselines;
})();

function descriptorsMatch(current: PropertyDescriptor, baseline: PropertyDescriptor): boolean {
  if (
    current.configurable !== baseline.configurable ||
    current.enumerable !== baseline.enumerable
  ) {
    return false;
  }
  if ('value' in current && 'value' in baseline) {
    return current.writable === baseline.writable && Object.is(current.value, baseline.value);
  }
  return (
    !('value' in current) &&
    !('value' in baseline) &&
    current.get === baseline.get &&
    current.set === baseline.set
  );
}

type BuiltinMutationSnapshot = {
  complete: boolean;
  values: unknown[];
};

function collectChangedBuiltinValues(): BuiltinMutationSnapshot {
  let complete = true;
  const values: unknown[] = [];
  for (const [builtinObject, baseline] of builtinPrototypeDescriptors) {
    if (Object.getPrototypeOf(builtinObject) !== baseline.prototype) {
      complete = false;
    }
    for (const key of Reflect.ownKeys(builtinObject)) {
      const descriptor = Object.getOwnPropertyDescriptor(builtinObject, key);
      const baselineDescriptor = baseline.descriptors.get(key);
      if (!descriptor || (baselineDescriptor && descriptorsMatch(descriptor, baselineDescriptor))) {
        continue;
      }
      if ('value' in descriptor) {
        values.push(descriptor.value);
      } else {
        complete = false;
      }
    }
  }
  return { complete, values };
}

function hasKnownBuiltinPrototypeChain(prototype: object | null): boolean {
  for (
    let currentPrototype = prototype;
    currentPrototype !== null;
    currentPrototype = Object.getPrototypeOf(currentPrototype)
  ) {
    if (!builtinPrototypeDescriptors.has(currentPrototype)) {
      return false;
    }
  }
  return true;
}

function walkVisibleValueGraph(
  value: unknown,
  visitObject: (value: object) => boolean,
  visitPrimitive: (value: unknown) => void,
): boolean {
  const pending: unknown[] = [value];
  const visited = new WeakSet<object>();
  let complete = true;
  const enqueue = (nestedValue: unknown): void => {
    if (isObjectLike(nestedValue)) {
      pending.push(nestedValue);
    } else {
      visitPrimitive(nestedValue);
    }
  };

  while (pending.length > 0) {
    const next = pending.pop();
    if (!isObjectLike(next)) {
      visitPrimitive(next);
      continue;
    }
    if (visited.has(next)) {
      continue;
    }
    visited.add(next);
    if (!visitObject(next)) {
      continue;
    }

    // A Proxy can hide reachable aliases while returning successful reflection
    // results. Private/internal slots on exotic objects are likewise not
    // enumerable. Only traverse container kinds whose complete graph is visible.
    if (utilTypes.isProxy(next)) {
      complete = false;
      continue;
    }
    const prototype = Object.getPrototypeOf(next);
    const isMap = prototype === Map.prototype;
    const isSet = prototype === Set.prototype;
    if (
      !Array.isArray(next) &&
      prototype !== Object.prototype &&
      prototype !== null &&
      !isMap &&
      !isSet
    ) {
      complete = false;
      continue;
    }

    if (!hasKnownBuiltinPrototypeChain(prototype)) {
      complete = false;
    }

    try {
      if (isMap) {
        Map.prototype.forEach.call(next, (nestedValue: unknown, key: unknown) => {
          enqueue(key);
          enqueue(nestedValue);
        });
      } else if (isSet) {
        Set.prototype.forEach.call(next, (nestedValue: unknown) => enqueue(nestedValue));
      }
    } catch {
      complete = false;
    }

    try {
      for (const key of Reflect.ownKeys(next)) {
        const descriptor = Object.getOwnPropertyDescriptor(next, key);
        if (descriptor && 'value' in descriptor) {
          enqueue(descriptor.value);
        } else if (descriptor) {
          complete = false;
        }
      }
    } catch {
      complete = false;
    }
  }

  return complete;
}

/** Marks all safely visible containers and string leaves under an opaque root. */
function collectProtectedContainers(
  value: unknown,
  protectedContainers: WeakSet<object>,
  protectedPrimitiveValues: Set<unknown>,
): boolean {
  return walkVisibleValueGraph(
    value,
    (container) => {
      if (protectedContainers.has(container)) {
        return false;
      }
      protectedContainers.add(container);
      return true;
    },
    (primitiveValue) => protectedPrimitiveValues.add(primitiveValue),
  );
}

/**
 * Checks whether a visible value graph aliases a protected container or string.
 * Incomplete reflection is reported separately so callers can retain the
 * conservative global fallback for proxies, accessors, and opaque containers.
 */
function inspectProtectedAliases(
  value: unknown,
  protectedContainers: WeakSet<object>,
  protectedPrimitiveValues: ReadonlySet<unknown>,
): { complete: boolean; containsProtected: boolean } {
  let containsProtected = false;
  const complete = walkVisibleValueGraph(
    value,
    (container) => {
      if (protectedContainers.has(container)) {
        containsProtected = true;
        return false;
      }
      return true;
    },
    (primitiveValue) => {
      containsProtected ||= protectedPrimitiveValues.has(primitiveValue);
    },
  );

  return { complete, containsProtected };
}

function referencesProtectedAliasPath(
  template: string,
  vars: Record<string, VarValue>,
  protectedPathRootNames: ReadonlySet<string>,
  protectedContainers: WeakSet<object>,
  protectedPrimitiveValues: ReadonlySet<unknown>,
): boolean {
  if (protectedPathRootNames.size === 0) {
    return false;
  }
  if (!template.includes('{')) {
    return false;
  }

  const evaluatedTemplate = template
    .replace(/{#[\s\S]*?#}/g, '')
    .replace(/{%-?\s*raw\s*-?%}[\s\S]*?{%-?\s*endraw\s*-?%}/g, '');
  const hasEvaluatedSyntax = /{{|{%/.test(evaluatedTemplate);
  if (!hasEvaluatedSyntax) {
    return false;
  }
  const analysis = analyzeTemplateReferences(template, protectedPathRootNames);
  if (!analysis.parsed) {
    return hasEvaluatedSyntax;
  }
  if (
    Array.from(analysis.allReferenced).some((rootName) => !protectedPathRootNames.has(rootName))
  ) {
    return true;
  }
  if (analysis.referenced.size === 0) {
    return hasEvaluatedSyntax;
  }

  // A parenthesized/filter result can be dereferenced after the static prefix
  // (for example `(items | first).polluted`). The prefix alone cannot prove the
  // final value safe, so preserve the template conservatively.
  if (analysis.referenced.size > 0 && /\)\s*(?:\.|\[)/.test(template)) {
    return true;
  }

  for (const rootName of analysis.referenced) {
    const escapedRoot = rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const staticPathPattern = new RegExp(
      `\\b${escapedRoot}(?![A-Za-z0-9_])(?:\\.[A-Za-z_]\\w*|\\[(?:\\d+|"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')\\])*`,
      'g',
    );
    const references = Array.from(template.matchAll(staticPathPattern));
    if (references.length === 0) {
      return true;
    }
    for (const match of references) {
      const reference = match[0];
      const suffix = template.slice((match.index ?? 0) + reference.length);
      if (/^\s*(?:\.|\[)/.test(suffix)) {
        return true;
      }
      const resolved = resolveStaticTemplateReference(reference, vars, true);
      if (!resolved) {
        return true;
      }
      const inspection = inspectProtectedAliases(
        resolved.value,
        protectedContainers,
        protectedPrimitiveValues,
      );
      if (!inspection.complete || inspection.containsProtected || isObjectLike(resolved.value)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * A nested string slot (`container[key]`) that may contain a Nunjucks template to
 * render once top-level vars are loaded: either text loaded from a nested
 * `file://` reference, or a nested string that references other vars such as
 * `report: "{{ file_content }}"` (issue #1613 form 2).
 */
type NestedRenderTarget = {
  container: object;
  filePath?: string;
  fromFile: boolean;
  key: string;
  originalValue?: string;
  rootVarName: string;
  template: string;
  topLevelFileVarName?: string;
};

type NestedFileRefLoadResult =
  | { loaded: false }
  | {
      loaded: true;
      filePath: string;
      value: string | undefined;
    };

function getDirectTopLevelReference(value: string): string | undefined {
  return /^\s*\{\{\s*([A-Za-z_]\w*)\s*\}\}\s*$/.exec(value)?.[1];
}

function getNestedFileReferencePath(value: string): string {
  const referencedPath = value.slice('file://'.length);
  return process.platform === 'win32' && /^\/[A-Za-z]:[\\/]/.test(referencedPath)
    ? referencedPath.slice(1)
    : referencedPath;
}

async function loadNestedFileRef(
  value: string,
  basePath: string,
  varName: string,
): Promise<NestedFileRefLoadResult> {
  const referencedPath = getNestedFileReferencePath(value);
  const filePath = path.resolve(process.cwd(), basePath, referencedPath);
  if (!isSupportedNestedTextFile(filePath)) {
    // Unlike top-level vars, JavaScript/Python/PDF/media references are intentionally
    // not loaded or executed when nested (they require execution or binary handling).
    // Leave the reference as a literal string and tell anyone debugging why.
    logger.debug(
      `Leaving nested file reference for var "${varName}" as a literal string: ${value}. Only text and YAML files are resolved when nested; JS/Python/PDF/media must be referenced by a top-level variable.`,
    );
    return { loaded: false };
  }

  logger.debug(`Resolving nested file reference for var "${varName}": ${value} -> ${filePath}`);
  try {
    const rawContents = await fs.readFile(filePath);
    const contents = Buffer.isBuffer(rawContents) ? rawContents : Buffer.from(rawContents);
    // Content must win over extension heuristics: a binary named `*.txt` (or an
    // extensionless executable whose basename looks like an extension) remains
    // literal instead of being decoded into the prompt.
    if (isBinary(null, contents)) {
      logger.debug(
        `Leaving nested file reference for var "${varName}" as a literal string because it is binary: ${value}`,
      );
      return { loaded: false };
    }
    const extension = path.extname(filePath).toLowerCase();
    const text = contents.toString('utf8');
    return {
      filePath,
      loaded: true,
      value:
        extension === '.yaml' || extension === '.yml'
          ? JSON.stringify(yaml.load(text) as string | object | undefined)
          : text.trim(),
    };
  } catch (error) {
    throw new Error(
      `Failed to load nested file reference for var "${varName}" (${filePath}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Walks nested plain objects and arrays, resolving textual `file://` values in
 * place and collecting every nested string slot that may need template rendering.
 * In-place mutation preserves cyclic graphs, aliases, and container prototypes
 * while matching renderPrompt's existing mutation of top-level file-backed vars.
 *
 * @param value The root container to walk.
 * @param basePath Base directory used to resolve relative file paths.
 * @param varName Name of the top-level var being resolved (used in error messages).
 * @returns Nested string slots to render after top-level vars are resolved.
 */
async function resolveNestedFileRefs(
  value: object,
  basePath: string,
  varName: string,
  topLevelFileVarNames: ReadonlySet<string>,
  protectedContainers: WeakSet<object>,
  protectedPrimitiveValues: ReadonlySet<unknown>,
  referencesProtectedTemplate: (template: string) => boolean,
  visited: WeakSet<object>,
  targetsByContainer: WeakMap<object, Map<string, NestedRenderTarget>>,
): Promise<NestedRenderTarget[]> {
  const pending: object[] = [value];
  const renderTargets: NestedRenderTarget[] = [];

  while (pending.length > 0) {
    const container = pending.pop()!;
    if (protectedContainers.has(container) || visited.has(container)) {
      continue;
    }
    visited.add(container);

    for (const key of Object.keys(container)) {
      const descriptor = Object.getOwnPropertyDescriptor(container, key);
      if (!descriptor || !('value' in descriptor)) {
        continue;
      }

      const nestedValue = descriptor.value;
      const isString = typeof nestedValue === 'string';
      const topLevelFileVarName = isString ? getDirectTopLevelReference(nestedValue) : undefined;
      const knownTarget = targetsByContainer.get(container)?.get(key);
      if (knownTarget) {
        continue;
      }
      if (protectedPrimitiveValues.has(nestedValue)) {
        continue;
      }
      if (isString && referencesProtectedTemplate(nestedValue)) {
        continue;
      }
      if (isString && nestedValue.startsWith('file://') && descriptor.writable === true) {
        const result = await loadNestedFileRef(nestedValue, basePath, varName);
        if (result.loaded) {
          Object.defineProperty(container, key, { ...descriptor, value: result.value });
        }
        if (result.loaded && typeof result.value === 'string') {
          const loadedTopLevelFileVarName = getDirectTopLevelReference(result.value);
          const target: NestedRenderTarget = {
            container,
            filePath: result.filePath,
            fromFile: true,
            key,
            originalValue: nestedValue,
            rootVarName: varName,
            template: result.value,
            ...(loadedTopLevelFileVarName && topLevelFileVarNames.has(loadedTopLevelFileVarName)
              ? { topLevelFileVarName: loadedTopLevelFileVarName }
              : {}),
          };
          renderTargets.push(target);
          const containerTargets = targetsByContainer.get(container) ?? new Map();
          containerTargets.set(key, target);
          targetsByContainer.set(container, containerTargets);
        }
      } else if (
        topLevelFileVarName &&
        descriptor.writable === true &&
        topLevelFileVarNames.has(topLevelFileVarName)
      ) {
        // Issue #1613 form 2 is a direct mapping to a top-level file-backed
        // variable. Do not broaden this into rendering arbitrary nested strings:
        // users commonly keep literal code and templates in object vars.
        const target: NestedRenderTarget = {
          container,
          fromFile: false,
          key,
          rootVarName: varName,
          template: nestedValue,
          topLevelFileVarName,
        };
        renderTargets.push(target);
        const containerTargets = targetsByContainer.get(container) ?? new Map();
        containerTargets.set(key, target);
        targetsByContainer.set(container, containerTargets);
      } else if (Array.isArray(nestedValue) || isPlainObject(nestedValue)) {
        pending.push(nestedValue);
      }
    }
  }

  return renderTargets;
}

function renderTopLevelStringVar(
  key: string,
  vars: Record<string, VarValue>,
  nunjucks: ReturnType<typeof getNunjucksEngine>,
  renderVars: Record<string, VarValue> = vars,
  rethrowErrors = false,
): VarValue {
  const value = vars[key];
  if (typeof value !== 'string' || referencesUndefinedVariables(value, renderVars)) {
    return value;
  }

  try {
    return nunjucks.renderString(autoWrapRawIfPartialNunjucks(value), renderVars);
  } catch (error) {
    if (rethrowErrors) {
      throw error;
    }
    // Keep the established top-level behavior: malformed or deferred templates
    // remain raw until the final prompt render decides whether they are needed.
    return value;
  }
}

function parseStaticTemplatePath(
  reference: string,
  rejectEscapedQuotedKeys = false,
): string[] | undefined {
  const root = /^([A-Za-z_]\w*)/.exec(reference);
  if (!root) {
    return undefined;
  }

  const segments = [root[1]];
  let offset = root[0].length;
  while (offset < reference.length) {
    if (reference[offset] === '.') {
      const property = /^\.([A-Za-z_]\w*)/.exec(reference.slice(offset));
      if (!property) {
        return undefined;
      }
      segments.push(property[1]);
      offset += property[0].length;
      continue;
    }

    if (reference[offset] !== '[') {
      return undefined;
    }
    const closingBracket = reference.indexOf(']', offset + 1);
    if (closingBracket === -1) {
      return undefined;
    }
    const token = reference.slice(offset + 1, closingBracket).trim();
    if (/^\d+$/.test(token)) {
      segments.push(token);
    } else if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      // Nunjucks' string-escape semantics are broader than JSON and the small
      // single-quote decoder below. Treat escaped property names as dynamic so
      // skipped-variable alias checks fail closed instead of resolving a decoy.
      if (rejectEscapedQuotedKeys && token.slice(1, -1).includes('\\')) {
        return undefined;
      }
      try {
        segments.push(
          token.startsWith('"')
            ? (JSON.parse(token) as string)
            : token.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\'),
        );
      } catch {
        return undefined;
      }
    } else {
      // Dynamic indexes cannot be mapped to one slot statically.
      return undefined;
    }
    offset = closingBracket + 1;
  }

  return segments;
}

function resolveStaticTemplateReference(
  reference: string,
  vars: Record<string, VarValue>,
  rejectEscapedQuotedKeys = false,
): { key?: string; parent?: object; value: unknown } | undefined {
  const segments = parseStaticTemplatePath(reference, rejectEscapedQuotedKeys);
  if (!segments) {
    return undefined;
  }

  let value: unknown = vars[segments[0]];
  let parent: object | undefined;
  let key: string | undefined;
  for (const segment of segments.slice(1)) {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, segment);
    if (!descriptor || !('value' in descriptor)) {
      return undefined;
    }
    parent = value;
    key = segment;
    value = descriptor.value;
  }
  return { key, parent, value };
}

function isUndefinedTemplateError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /attempted to output (?:null or )?undefined value|undefined or null/i.test(error.message)
  );
}

function renderNestedTarget(
  target: NestedRenderTarget,
  templateVars: Record<string, VarValue>,
  strictNunjucks: ReturnType<typeof getNunjucksEngine>,
  referencesProtectedTemplate: (template: string) => boolean,
): void {
  const { template } = target;
  const current = getWritableStringProp(target.container, target.key);
  if (current === undefined || current !== template) {
    return;
  }
  if (referencesProtectedTemplate(template)) {
    if (target.fromFile && target.originalValue !== undefined) {
      setNestedValue(target.container, target.key, target.originalValue);
    }
    return;
  }

  if (
    target.topLevelFileVarName &&
    Object.prototype.hasOwnProperty.call(templateVars, target.topLevelFileVarName) &&
    templateVars[target.topLevelFileVarName] === undefined
  ) {
    setNestedValue(target.container, target.key, undefined);
    return;
  }

  let rendered: string;
  try {
    rendered = strictNunjucks.renderString(autoWrapRawIfPartialNunjucks(template), templateVars);
  } catch (error) {
    if (isUndefinedTemplateError(error)) {
      // Match top-level file vars: unresolved placeholders are intentionally
      // deferred so a later workflow can provide them.
      return;
    }
    if (target.fromFile) {
      throw new Error(
        `Failed to render nested file reference for var "${target.rootVarName}" (${target.filePath}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    logger.debug(
      `Leaving nested var "${target.key}" raw; it is not a valid template: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (rendered !== current) {
    setNestedValue(target.container, target.key, rendered);
  }
}

function renderNestedFileRefTemplates(
  renderTargets: NestedRenderTarget[],
  basePrompt: string,
  vars: Record<string, VarValue>,
  nunjucks: ReturnType<typeof getNunjucksEngine>,
  strictNunjucks: ReturnType<typeof getNunjucksEngine>,
  protectedDirectVarNames: ReadonlySet<string>,
  referencesProtectedTemplate: (template: string) => boolean,
): Map<string, VarValue> {
  const renderedTopLevelVars = new Map<string, VarValue>();
  if (getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return renderedTopLevelVars;
  }
  if (renderTargets.length === 0) {
    return renderedTopLevelVars;
  }

  const templateVars = { ...vars };
  const topLevelStringStates = new Map<string, 'visiting' | 'done'>();
  const states = new Map<NestedRenderTarget, 'visiting' | 'done'>();
  const targetsByContainer = new WeakMap<object, Map<string, NestedRenderTarget>>();
  const mappedTopLevelFileVarNames = new Set(
    renderTargets.flatMap((target) => target.topLevelFileVarName ?? []),
  );
  for (const target of renderTargets) {
    const containerTargets = targetsByContainer.get(target.container) ?? new Map();
    containerTargets.set(target.key, target);
    targetsByContainer.set(target.container, containerTargets);
  }

  const referencedTargetsCache = new Map<string, Set<NestedRenderTarget>>();
  const findReferencedTargets = (reference: string): Set<NestedRenderTarget> => {
    const cached = referencedTargetsCache.get(reference);
    if (cached) {
      return cached;
    }
    const targets = new Set<NestedRenderTarget>();
    const rootName = /^([A-Za-z_]\w*)/.exec(reference)?.[1];
    const resolved =
      resolveStaticTemplateReference(reference, vars) ??
      (rootName && typeof vars[rootName] === 'object' ? { value: vars[rootName] } : undefined);
    if (resolved?.parent && resolved.key !== undefined) {
      const aliasedTarget = targetsByContainer.get(resolved.parent)?.get(resolved.key);
      if (aliasedTarget) {
        targets.add(aliasedTarget);
        referencedTargetsCache.set(reference, targets);
        return targets;
      }
    }

    if (typeof resolved?.value === 'object' && resolved.value !== null) {
      const pending: object[] = [resolved.value];
      const visited = new WeakSet<object>();
      while (pending.length > 0) {
        const container = pending.pop()!;
        if (visited.has(container)) {
          continue;
        }
        visited.add(container);
        for (const target of targetsByContainer.get(container)?.values() ?? []) {
          targets.add(target);
        }
        for (const property of Reflect.ownKeys(container)) {
          const descriptor = Object.getOwnPropertyDescriptor(container, property);
          if (
            descriptor &&
            'value' in descriptor &&
            typeof descriptor.value === 'object' &&
            descriptor.value !== null
          ) {
            pending.push(descriptor.value);
          }
        }
      }
      referencedTargetsCache.set(reference, targets);
      return targets;
    }
    referencedTargetsCache.set(reference, targets);
    return targets;
  };
  const referenceCache = new Map<string, string[]>();
  const extractResolvableReferences = (template: string): string[] => {
    const cached = referenceCache.get(template);
    if (cached) {
      return cached;
    }

    const analyzableTemplate = autoWrapRawIfPartialNunjucks(template);

    // The legacy regex preserves useful static paths, but it also sees symbols
    // inside raw blocks and locally-bound loop bodies. Validate each root with
    // the scope-aware AST walker before treating it as a live dependency.
    const extractedReferences = extractVariablesFromTemplate(analyzableTemplate);
    for (const match of analyzableTemplate.matchAll(
      /{%\s*set\s+[A-Za-z_]\w*\s*=\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/g,
    )) {
      extractedReferences.push(match[1]);
    }
    const lexicalCandidates = new Set(
      Array.from(analyzableTemplate.matchAll(/\b[A-Za-z_]\w*\b/g), (match) => match[0]),
    );
    const candidateRoots = new Set(
      extractedReferences.flatMap((reference) => /^([A-Za-z_]\w*)/.exec(reference)?.[1] ?? []),
    );
    for (const candidate of lexicalCandidates) {
      if (Object.prototype.hasOwnProperty.call(vars, candidate)) {
        candidateRoots.add(candidate);
      }
    }
    const { referenced: liveRoots } = analyzeTemplateReferences(analyzableTemplate, candidateRoots);
    const references = extractedReferences.filter((reference) => {
      const rootName = /^([A-Za-z_]\w*)/.exec(reference)?.[1];
      return Boolean(rootName && liveRoots.has(rootName));
    });
    const referencedRoots = new Set(
      references.flatMap((reference) => /^([A-Za-z_]\w*)/.exec(reference)?.[1] ?? []),
    );
    for (const varName of liveRoots) {
      if (!referencedRoots.has(varName)) {
        references.push(varName);
      }
    }
    referenceCache.set(template, references);
    return references;
  };

  const reachabilityTemplates = (() => {
    if (getEnvBool('PROMPTFOO_DISABLE_JSON_AUTOESCAPE')) {
      return [basePrompt];
    }
    try {
      const templates: string[] = [];
      const pending: unknown[] = [JSON.parse(basePrompt)];
      while (pending.length > 0) {
        const value = pending.pop();
        if (typeof value === 'string') {
          templates.push(value);
        } else if (Array.isArray(value)) {
          pending.push(...value);
        } else if (value && typeof value === 'object') {
          pending.push(...Object.values(value));
        }
      }
      return templates;
    } catch {
      return [basePrompt];
    }
  })();
  const pendingReachabilityTemplates = [...reachabilityTemplates];
  const visitedTopLevelVars = new Set<string>();
  while (pendingReachabilityTemplates.length > 0) {
    const template = pendingReachabilityTemplates.pop()!;
    for (const reference of extractResolvableReferences(template)) {
      const rootName = /^([A-Za-z_]\w*)/.exec(reference)?.[1];
      const value = rootName ? vars[rootName] : undefined;
      if (
        rootName &&
        !visitedTopLevelVars.has(rootName) &&
        typeof value === 'string' &&
        !protectedDirectVarNames.has(rootName) &&
        !referencesProtectedTemplate(value)
      ) {
        visitedTopLevelVars.add(rootName);
        reachabilityTemplates.push(value);
        pendingReachabilityTemplates.push(value);
      }
    }
  }

  function renderTopLevelStringWithDependencies(rootName: string): void {
    const state = topLevelStringStates.get(rootName);
    const value = vars[rootName];
    if (
      state === 'done' ||
      state === 'visiting' ||
      typeof value !== 'string' ||
      protectedDirectVarNames.has(rootName) ||
      referencesProtectedTemplate(value)
    ) {
      return;
    }
    topLevelStringStates.set(rootName, 'visiting');

    for (const reference of extractResolvableReferences(value)) {
      const dependencyRoot = /^([A-Za-z_]\w*)/.exec(reference)?.[1];
      if (dependencyRoot && dependencyRoot !== rootName) {
        renderTopLevelStringWithDependencies(dependencyRoot);
      }
      for (const dependency of findReferencedTargets(reference)) {
        renderWithDependencies(dependency);
      }
    }

    templateVars[rootName] = renderTopLevelStringVar(
      rootName,
      vars,
      nunjucks,
      templateVars,
      mappedTopLevelFileVarNames.has(rootName),
    );
    renderedTopLevelVars.set(rootName, templateVars[rootName]);
    topLevelStringStates.set(rootName, 'done');
  }

  function renderWithDependencies(target: NestedRenderTarget): void {
    const state = states.get(target);
    if (state === 'done' || state === 'visiting') {
      return;
    }
    states.set(target, 'visiting');

    for (const reference of extractResolvableReferences(target.template)) {
      const rootName = /^([A-Za-z_]\w*)/.exec(reference)?.[1];
      if (rootName) {
        renderTopLevelStringWithDependencies(rootName);
      }
      for (const dependency of findReferencedTargets(reference)) {
        if (dependency !== target) {
          renderWithDependencies(dependency);
        }
      }
    }

    renderNestedTarget(target, templateVars, strictNunjucks, referencesProtectedTemplate);
    states.set(target, 'done');
  }

  if (/^(?:portkey|langfuse|helicone):\/\//.test(basePrompt)) {
    for (const target of renderTargets) {
      renderWithDependencies(target);
    }
  } else {
    for (const template of reachabilityTemplates) {
      for (const reference of extractResolvableReferences(template)) {
        for (const target of findReferencedTargets(reference)) {
          renderWithDependencies(target);
        }
      }
    }
  }
  return renderedTopLevelVars;
}

/**
 * Gets MIME type from file extension
 *
 * Supported formats:
 * - JPEG/JPG (image/jpeg)
 * - PNG (image/png)
 * - GIF (image/gif)
 * - WebP (image/webp)
 * - BMP (image/bmp)
 * - SVG (image/svg+xml)
 * - TIFF (image/tiff)
 * - ICO (image/x-icon)
 * - AVIF (image/avif)
 * - HEIC/HEIF (image/heic)
 *
 * @param extension File extension (with or without dot)
 * @returns MIME type string (defaults to image/jpeg for unknown formats)
 */
function getMimeTypeFromExtension(extension: string): string {
  const normalizedExt = extension.toLowerCase().replace(/^\./, '');
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    ico: 'image/x-icon',
    avif: 'image/avif',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return mimeTypes[normalizedExt] || 'image/jpeg';
}

/**
 * Detects MIME type from base64 magic numbers for additional accuracy
 *
 * Magic numbers (base64-encoded file signatures):
 * - JPEG: /9j/ (0xFFD8FF)
 * - PNG: iVBORw0KGgo (0x89504E47)
 * - GIF: R0lGODlh or R0lGODdh (GIF87a/GIF89a)
 * - WebP: UklGR (RIFF)
 * - BMP: Qk0 or Qk1 (BM)
 * - TIFF: SUkq or TU0A (II* or MM*)
 * - ICO: AAABAA (0x00000100)
 *
 * @param base64Data Base64 encoded image data
 * @returns MIME type string or null if format cannot be detected
 */
function detectMimeFromBase64(base64Data: string): string | null {
  // Check magic numbers at the start of base64 data
  if (base64Data.startsWith('/9j/')) {
    return 'image/jpeg';
  } else if (base64Data.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  } else if (base64Data.startsWith('R0lGODlh') || base64Data.startsWith('R0lGODdh')) {
    return 'image/gif';
  } else if (base64Data.startsWith('UklGR')) {
    return 'image/webp';
  } else if (base64Data.startsWith('Qk0') || base64Data.startsWith('Qk1')) {
    return 'image/bmp';
  } else if (base64Data.startsWith('SUkq') || base64Data.startsWith('TU0A')) {
    return 'image/tiff';
  } else if (base64Data.startsWith('AAABAA')) {
    return 'image/x-icon';
  }
  // Return null if format cannot be detected - caller will log warning
  return null;
}

/**
 * Renders a prompt template with variable substitution using Nunjucks.
 *
 * @param prompt - The prompt template to render
 * @param vars - Variables to substitute into the template
 * @param nunjucksFilters - Optional custom Nunjucks filters
 * @param provider - Optional API provider for context
 * @param skipRenderVars - Optional array of variable names to skip special loading and template
 *                         rendering for. This is critical for red team testing where injection
 *                         variables contain attack payloads (e.g., SSTI, XSS) that should NOT be
 *                         evaluated by Promptfoo before reaching the target.
 * @param runtimeRegisterNames - Runtime register roots captured from provider output. These are
 *                               treated as opaque data during preprocessing.
 * @returns The rendered prompt string
 */
export async function renderPrompt(
  prompt: Prompt,
  vars: Record<string, VarValue>,
  nunjucksFilters?: NunjucksFilterMap,
  provider?: ApiProvider,
  skipRenderVars?: string[],
  runtimeRegisterNames?: string[],
): Promise<string> {
  const nunjucks = getNunjucksEngine(nunjucksFilters);
  const nestedRenderTargets: NestedRenderTarget[] = [];
  const nestedTargetsByContainer = new WeakMap<object, Map<string, NestedRenderTarget>>();
  const protectedNestedContainers = new WeakSet<object>();
  const protectedPrimitiveValues = new Set<unknown>();
  const protectedVarNames = Array.from(
    new Set([...(skipRenderVars ?? []), ...(runtimeRegisterNames ?? [])]),
  );
  const hasProtectedRoots =
    protectedVarNames.length > 0 || Object.prototype.hasOwnProperty.call(vars, '_conversation');
  const builtinMutations = hasProtectedRoots
    ? collectChangedBuiltinValues()
    : { complete: true, values: [] };
  let preprocessingDisabled = !builtinMutations.complete;

  let basePrompt = prompt.raw;

  for (const [varName, value] of Object.entries(vars)) {
    if (varName === '_conversation' || protectedVarNames.includes(varName)) {
      preprocessingDisabled =
        !collectProtectedContainers(value, protectedNestedContainers, protectedPrimitiveValues) ||
        preprocessingDisabled;
    }
  }

  if (hasProtectedRoots) {
    const builtinMutationInspection = inspectProtectedAliases(
      builtinMutations.values,
      protectedNestedContainers,
      protectedPrimitiveValues,
    );
    preprocessingDisabled ||=
      !builtinMutationInspection.complete || builtinMutationInspection.containsProtected;
  }

  const protectedAliasRootNames = new Set<string>();
  const protectedPathRootNames = new Set<string>();
  if (hasProtectedRoots) {
    for (const [varName, value] of Object.entries(vars)) {
      if (varName === '_conversation' || protectedVarNames.includes(varName)) {
        continue;
      }
      protectedPathRootNames.add(varName);
      if (!isObjectLike(value)) {
        if (protectedPrimitiveValues.has(value)) {
          protectedAliasRootNames.add(varName);
        }
        continue;
      }
      const inspection = inspectProtectedAliases(
        value,
        protectedNestedContainers,
        protectedPrimitiveValues,
      );
      if (inspection.containsProtected) {
        protectedAliasRootNames.add(varName);
      }
      if (!inspection.complete) {
        preprocessingDisabled = true;
      }
    }
  }
  let templateReferenceVars = vars;
  if (
    hasProtectedRoots &&
    typeof nunjucks.getGlobal === 'function' &&
    !Object.prototype.hasOwnProperty.call(vars, 'env')
  ) {
    const envGlobal = nunjucks.getGlobal('env');
    if (envGlobal !== undefined) {
      templateReferenceVars = Object.create(null) as Record<string, VarValue>;
      Object.defineProperties(templateReferenceVars, Object.getOwnPropertyDescriptors(vars));
      Object.defineProperty(templateReferenceVars, 'env', {
        configurable: true,
        enumerable: true,
        value: envGlobal,
        writable: true,
      });
      protectedPathRootNames.add('env');
    }
  }
  const protectedDirectVarNames = new Set([...protectedVarNames, ...protectedAliasRootNames]);
  const protectedTemplateVarNames = Array.from(protectedDirectVarNames);
  const varsResolvedFromProtected = new Set<string>();
  const referencesProtectedTemplate = (template: string): boolean =>
    referencesSkippedVariables(template, protectedVarNames, varsResolvedFromProtected) ||
    referencesProtectedAliasPath(
      template,
      templateReferenceVars,
      protectedPathRootNames,
      protectedNestedContainers,
      protectedPrimitiveValues,
    );
  const topLevelFileVarNames = new Set(
    Object.entries(vars)
      .filter(
        ([varName, value]) =>
          varName !== '_conversation' &&
          !protectedDirectVarNames.has(varName) &&
          typeof value === 'string' &&
          value.startsWith('file://'),
      )
      .map(([varName]) => varName),
  );

  // Load files
  for (const [varName, value] of Object.entries(vars)) {
    if (preprocessingDisabled) {
      continue;
    }
    if (varName === '_conversation' || protectedVarNames.includes(varName)) {
      continue;
    }
    if (typeof value === 'string' && protectedAliasRootNames.has(varName)) {
      continue;
    }

    if (typeof value === 'string' && value.startsWith('file://')) {
      const basePath = cliState.basePath || '';
      const filePath = path.resolve(process.cwd(), basePath, value.slice('file://'.length));
      const fileExtension = filePath.split('.').pop();

      logger.debug(`Loading var ${varName} from file: ${filePath}`);
      if (isJavascriptFile(filePath)) {
        const javascriptOutput = (await (
          await importModule(filePath)
        )(varName, basePrompt, vars, provider)) as {
          output?: string;
          error?: string;
        };
        if (javascriptOutput.error) {
          throw new Error(`Error running ${filePath}: ${javascriptOutput.error}`);
        }
        if (!javascriptOutput.output) {
          throw new Error(
            `Expected ${filePath} to return { output: string } but got ${javascriptOutput}`,
          );
        }
        vars[varName] = javascriptOutput.output;
      } else if (fileExtension === 'py') {
        const pythonScriptOutput = (await runPython(filePath, 'get_var', [
          varName,
          basePrompt,
          vars,
        ])) as { output?: unknown; error?: string };
        if (pythonScriptOutput.error) {
          throw new Error(`Error running Python script ${filePath}: ${pythonScriptOutput.error}`);
        }
        if (!pythonScriptOutput.output) {
          throw new Error(`Python script ${filePath} did not return any output`);
        }
        invariant(
          typeof pythonScriptOutput.output === 'string',
          `pythonScriptOutput.output must be a string. Received: ${typeof pythonScriptOutput.output}`,
        );
        vars[varName] = pythonScriptOutput.output.trim();
      } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
        vars[varName] = JSON.stringify(
          yaml.load(await fs.readFile(filePath, 'utf8')) as string | object,
        );
      } else if (fileExtension === 'pdf' && !getEnvBool('PROMPTFOO_DISABLE_PDF_AS_TEXT')) {
        telemetry.record('feature_used', {
          feature: 'extract_text_from_pdf',
        });
        vars[varName] = await extractTextFromPDF(filePath);
      } else if (
        (isImageFile(filePath) || isVideoFile(filePath) || isAudioFile(filePath)) &&
        !getEnvBool('PROMPTFOO_DISABLE_MULTIMEDIA_AS_BASE64')
      ) {
        const fileType = isImageFile(filePath)
          ? 'image'
          : isVideoFile(filePath)
            ? 'video'
            : 'audio';

        telemetry.record('feature_used', {
          feature: `load_${fileType}_as_base64`,
        });

        logger.debug(`Loading ${fileType} as base64: ${filePath}`);
        try {
          const fileBuffer = await fs.readFile(filePath);
          const base64Data = fileBuffer.toString('base64');

          if (fileType === 'image') {
            // For images, generate data URL with proper MIME type
            // Use extension first, then magic number detection for accuracy
            let mimeType = getMimeTypeFromExtension(path.extname(filePath));
            const extension = path.extname(filePath);
            const extensionWasUnknown = !extension || mimeType === 'image/jpeg';

            // For better accuracy, use magic number detection
            const detectedType = detectMimeFromBase64(base64Data);
            if (detectedType) {
              // Use detected type if available and different from extension-based guess
              if (detectedType !== mimeType) {
                logger.debug(
                  `Magic number detection overriding extension-based MIME type: ${detectedType} (was ${mimeType}) for ${filePath}`,
                );
                mimeType = detectedType;
              }
            } else if (extensionWasUnknown) {
              // Could not detect format and extension was unknown/ambiguous
              logger.warn(
                `Could not detect image format for ${filePath}, defaulting to image/jpeg. Supported formats: JPEG, PNG, GIF, WebP, BMP, TIFF, ICO, AVIF, HEIC, SVG`,
              );
            }

            vars[varName] = `data:${mimeType};base64,${base64Data}`;
          } else {
            // Keep existing behavior for video/audio files (raw base64)
            vars[varName] = base64Data;
          }
        } catch (error) {
          throw new Error(
            `Failed to load ${fileType} ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        vars[varName] = (await fs.readFile(filePath, 'utf8')).trim();
      }
    } else if (isPackagePath(value)) {
      const basePath = cliState.basePath || '';
      const requiredModule = await loadFromPackage(value, basePath);
      if (typeof requiredModule !== 'function') {
        throw new Error(
          `Variable source malformed: ${value} must export a function. Received: ${typeof requiredModule}`,
        );
      }

      const javascriptOutput = (await requiredModule(varName, basePrompt, vars, provider)) as {
        output?: string;
        error?: string;
      };
      if (javascriptOutput.error) {
        throw new Error(`Error running ${value}: ${javascriptOutput.error}`);
      }
      if (!javascriptOutput.output) {
        throw new Error(
          `Expected ${value} to return { output: string } but got ${javascriptOutput}`,
        );
      }
      vars[varName] = javascriptOutput.output;
    } else if (!preprocessingDisabled && (Array.isArray(value) || isPlainObject(value))) {
      const basePath = cliState.basePath || '';
      nestedRenderTargets.push(
        ...(await resolveNestedFileRefs(
          value,
          basePath,
          varName,
          topLevelFileVarNames,
          protectedNestedContainers,
          protectedPrimitiveValues,
          referencesProtectedTemplate,
          new WeakSet<object>(),
          nestedTargetsByContainer,
        )),
      );
    }
  }

  // Apply prompt functions
  if (prompt.function) {
    const result = await prompt.function({ vars, provider });
    if (typeof result === 'string') {
      basePrompt = result;
    } else if (typeof result === 'object') {
      // Check if it's using the structured PromptFunctionResult format
      if ('prompt' in result) {
        basePrompt =
          typeof result.prompt === 'string' ? result.prompt : JSON.stringify(result.prompt);

        // Merge config if provided
        if (result.config) {
          prompt.config = {
            ...(prompt.config || {}),
            ...result.config,
          };
        }
      } else {
        // Direct object/array format
        basePrompt = JSON.stringify(result);
      }
    } else {
      throw new Error(`Prompt function must return a string or object, got ${typeof result}`);
    }
  }

  // Remove any trailing newlines from vars, as this tends to be a footgun for JSON prompts.
  if (!preprocessingDisabled) {
    for (const key of Object.keys(vars)) {
      if (typeof vars[key] === 'string' && !protectedDirectVarNames.has(key)) {
        vars[key] = (vars[key] as string).replace(/\n$/, '');
      }
    }
  }
  // Resolve variable mappings
  if (!preprocessingDisabled) {
    resolveVariables(vars, protectedTemplateVarNames, varsResolvedFromProtected);
  }
  const strictNunjucks = getNunjucksEngine(nunjucksFilters, true);
  const nestedRenderedTopLevelVars = renderNestedFileRefTemplates(
    nestedRenderTargets,
    basePrompt,
    vars,
    nunjucks,
    strictNunjucks,
    protectedDirectVarNames,
    referencesProtectedTemplate,
  );
  // Third party integrations
  if (prompt.raw.startsWith('portkey://')) {
    const portKeyResult = await getPortkeyPrompt(prompt.raw.slice('portkey://'.length), vars);
    return JSON.stringify(portKeyResult.messages);
  } else if (prompt.raw.startsWith('langfuse://')) {
    const langfusePrompt = prompt.raw.slice('langfuse://'.length);

    let helper: string;
    let version: string | undefined;
    let label: string | undefined;
    let promptType: 'text' | 'chat' | undefined = 'text';

    // More robust parsing that handles @ in prompt IDs
    // Look for the last @ that's followed by a label pattern
    const labelMatch = langfusePrompt.match(/^(.+)@([^:@]+)(?::(.+))?$/);
    const versionMatch = langfusePrompt.match(/^([^:]+):([^:]+)(?::(.+))?$/);

    if (labelMatch) {
      // Label-based syntax: prompt-id@label or prompt-id@label:type
      helper = labelMatch[1];
      label = labelMatch[2];
      if (labelMatch[3]) {
        promptType = labelMatch[3] as 'text' | 'chat';
      }
    } else if (versionMatch) {
      // Version/label syntax: prompt-id:version-or-label or prompt-id:version-or-label:type
      helper = versionMatch[1];
      const versionOrLabel = versionMatch[2];

      // Auto-detect if it's a version (numeric) or label (string)
      if (/^\d+$/.test(versionOrLabel)) {
        // It's a numeric version
        version = versionOrLabel;
      } else {
        // It's a string, treat as label
        label = versionOrLabel;
        if (label === 'latest') {
          // 'latest' is always treated as a label, even though it could be ambiguous
          version = undefined;
        }
      }

      if (versionMatch[3]) {
        promptType = versionMatch[3] as 'text' | 'chat';
      }
    } else {
      // Simple prompt-id only
      helper = langfusePrompt;
    }

    if (promptType !== 'text' && promptType !== 'chat') {
      throw new Error(`Invalid Langfuse prompt type: ${promptType}. Must be 'text' or 'chat'.`);
    }

    const langfuseResult = await getLangfusePrompt(
      helper,
      vars,
      promptType,
      version === undefined || version === 'latest' ? undefined : Number(version),
      label,
    );
    return langfuseResult;
  } else if (prompt.raw.startsWith('helicone://')) {
    const heliconePrompt = prompt.raw.slice('helicone://'.length);
    const [id, version] = heliconePrompt.split(':');
    const [majorVersion, minorVersion] = version ? version.split('.') : [undefined, undefined];
    const heliconeResult = await getHeliconePrompt(
      id,
      vars,
      majorVersion === undefined ? undefined : Number(majorVersion),
      minorVersion === undefined ? undefined : Number(minorVersion),
    );
    return heliconeResult;
  }
  // Render prompt
  try {
    if (getEnvBool('PROMPTFOO_DISABLE_JSON_AUTOESCAPE')) {
      // Pre-process: auto-wrap in {% raw %} if partial Nunjucks tags detected
      basePrompt = autoWrapRawIfPartialNunjucks(basePrompt);
      return nunjucks.renderString(basePrompt, vars);
    }

    const parsed = JSON.parse(basePrompt);
    // The _raw_ prompt is valid JSON. That means that the user likely wants to substitute vars _within_ the JSON itself.
    // Recursively walk the JSON structure. If we find a string, render it with nunjucks.
    return JSON.stringify(renderVarsInObject(parsed, vars), null, 2);
  } catch {
    // Vars values can be template strings, so we need to render them first:
    const renderedVars = Object.fromEntries(
      Object.entries(vars).map(([key, value]) => {
        if (
          typeof value !== 'string' ||
          preprocessingDisabled ||
          protectedDirectVarNames.has(key) ||
          varsResolvedFromProtected.has(key) ||
          referencesProtectedTemplate(value)
        ) {
          return [key, value];
        }

        if (referencesUndefinedVariables(value, vars)) {
          return [key, value];
        }

        if (nestedRenderedTopLevelVars.has(key)) {
          return [key, nestedRenderedTopLevelVars.get(key)];
        }

        return [key, nunjucks.renderString(autoWrapRawIfPartialNunjucks(value), vars)];
      }),
    );

    // Pre-process: auto-wrap in {% raw %} if partial Nunjucks tags detected
    basePrompt = autoWrapRawIfPartialNunjucks(basePrompt);
    // Note: Explicitly not using `renderVarsInObject` as it will re-call `renderString`; each call will
    // strip Nunjucks Tags, which breaks using raw (https://mozilla.github.io/nunjucks/templating.html#raw) e.g.
    // {% raw %}{{some_string}}{% endraw %} -> {{some_string}} -> ''
    return nunjucks.renderString(basePrompt, renderedVars);
  }
}

// ================================
// Extension Hooks
// ================================

/**
 * Context passed to beforeAll extension hooks.
 * Called once before the evaluation starts.
 */
export type BeforeAllExtensionHookContext = {
  /** The test suite configuration (mutable) */
  suite: TestSuite;
};

/**
 * Context passed to beforeEach extension hooks.
 * Called before each test case is evaluated.
 */
export type BeforeEachExtensionHookContext = {
  /** The test case about to be evaluated (mutable) */
  test: TestCase;
};

/**
 * Context passed to afterEach extension hooks.
 * Called after each test case is evaluated.
 *
 * When the hook returns the modified context, `result.namedScores`,
 * `result.metadata`, and `result.response.metadata` will be shallow-merged
 * into the evaluation result and persisted.
 */
export type AfterEachExtensionHookContext = {
  /** The test case that was evaluated */
  test: TestCase;
  /** The result of the evaluation (namedScores, metadata, and response.metadata are mutable) */
  result: EvaluateResult;
};

/**
 * Context passed to afterAll extension hooks.
 * Called once after all evaluations complete.
 *
 * @example
 * ```javascript
 * // extension.js
 * module.exports = {
 *   afterAll: async (context) => {
 *     console.log(`Eval ${context.evalId} completed`);
 *     console.log(`Results: ${context.results.length} tests`);
 *     // Send to monitoring, database, etc.
 *   }
 * };
 * ```
 */
export type AfterAllExtensionHookContext = {
  /** The test suite configuration */
  suite: TestSuite;
  /** All evaluation results as plain data objects */
  results: EvaluateResult[];
  /** Completed prompts with metrics */
  prompts: CompletedPrompt[];
  /** Unique identifier for this evaluation run */
  evalId: string;
  /** The full evaluation configuration */
  config: Partial<UnifiedConfig>;
};

/**
 * Maps hook names to their context types.
 * Used for type-safe extension hook invocation.
 */
export type ExtensionHookContextMap = {
  beforeAll: BeforeAllExtensionHookContext;
  beforeEach: BeforeEachExtensionHookContext;
  afterEach: AfterEachExtensionHookContext;
  afterAll: AfterAllExtensionHookContext;
};

/**
 * Runs extension hooks for the given hook name and context. The hook will be called with the context object,
 * and can update the context object to persist data into provider calls.
 * @param extensions - An array of extension paths, or null.
 * @param hookName - The name of the hook to run.
 * @param context - The context object to pass to the hook. T depends on the type of the hook.
 * @returns A Promise that resolves with one of the following:
 *  - The original context object, if no extensions are provided OR if the returned context is not valid.
 *  - The updated context object, if the extension hook returns a valid context object. The updated context,
 *    if defined, must conform to the type T; otherwise, a validation error is thrown.
 */
/**
 * Valid hook names that can be used to filter which hooks an extension runs for.
 * If an extension specifies one of these as its function name (e.g., file://path:beforeAll),
 * it will only run for that specific hook and use the NEW calling convention: (context, { hookName }).
 * If an extension specifies a custom function name (e.g., file://path:myHandler),
 * it will run for ALL hooks and use the LEGACY calling convention: (hookName, context).
 */
const EXTENSION_HOOK_NAMES = new Set(['beforeAll', 'beforeEach', 'afterEach', 'afterAll']);

/**
 * Extracts the hook name from an extension path.
 * Format: file://path/to/file.js:hookName or file://path/to/file.py:hook_name
 * @returns The hook name or undefined if not specified
 */
export function getExtensionHookName(extension: string): string | undefined {
  if (!extension.startsWith('file://')) {
    return undefined;
  }
  const lastColonIndex = extension.lastIndexOf(':');
  // Check if colon is part of Windows drive letter (position 8 after file://) or not present
  if (lastColonIndex > 8) {
    const functionName = extension.slice(lastColonIndex + 1);
    // Return undefined for empty strings (e.g., "file://hooks.js:")
    return functionName || undefined;
  }
  return undefined;
}

/**
 * Re-attaches the non-serializable `function` callable to prompts returned from a
 * `beforeAll` extension hook.
 *
 * Python extension hooks run in a subprocess, so the context is serialized with
 * `JSON.stringify` on the way in and parsed on the way out. (JavaScript hooks run
 * in-process and keep live references, so they are unaffected unless they clone the
 * suite themselves.) JSON cannot represent the `function` property that
 * `file://...:fn` prompts carry, so it is dropped on the round-trip. Without
 * restoring it, the evaluator falls back to sending the prompt's raw source as text
 * instead of executing the function
 * (https://github.com/promptfoo/promptfoo/issues/9653).
 *
 * A returned prompt is matched to an original by `label` (the stable identifier for
 * file-based prompts) and the function is only restored when the original carried one
 * and the `raw` source is unchanged — so a hook that intentionally rewrites a prompt
 * keeps its new behavior. Labels shared by more than one function-carrying original
 * are treated as ambiguous and skipped to avoid restoring the wrong function.
 */
function restorePromptFunctions(returnedPrompts: Prompt[], originalPrompts: Prompt[]): Prompt[] {
  if (!Array.isArray(returnedPrompts) || !Array.isArray(originalPrompts)) {
    return returnedPrompts;
  }

  const originalsByLabel = new Map<string, Prompt | null>();
  for (const original of originalPrompts) {
    if (!original || typeof original.function !== 'function' || original.label == null) {
      continue;
    }
    // A null entry marks an ambiguous (duplicated) label that must not be restored.
    originalsByLabel.set(original.label, originalsByLabel.has(original.label) ? null : original);
  }
  if (originalsByLabel.size === 0) {
    return returnedPrompts;
  }

  const restored = returnedPrompts.map((returned) => {
    if (!returned || typeof returned.function === 'function' || returned.label == null) {
      return returned;
    }
    const original = originalsByLabel.get(returned.label);
    if (original && original.raw === returned.raw) {
      return { ...returned, function: original.function };
    }
    return returned;
  });

  // A prompt function that was neither restored nor returned by the hook means the
  // prompt will render its raw source as text — the original #9653 symptom. Surface
  // why, so users get a breadcrumb instead of a silent behavior change.
  const labelsWithFunction = new Set<string>();
  const returnedLabels = new Set<string>();
  for (const prompt of restored) {
    if (prompt?.label != null) {
      returnedLabels.add(prompt.label);
      if (typeof prompt.function === 'function') {
        labelsWithFunction.add(prompt.label);
      }
    }
  }
  for (const [label, original] of originalsByLabel) {
    if (labelsWithFunction.has(label)) {
      continue;
    }
    if (original === null) {
      if (returnedLabels.has(label)) {
        logger.warn(
          `beforeAll extension hook: multiple prompts share the label "${label}", so their prompt functions cannot be safely restored after the hook's serialized round-trip. These prompts will render their raw source as text. Give each prompt a unique label to fix this.`,
        );
      }
    } else if (returnedLabels.has(label)) {
      logger.debug(
        `beforeAll extension hook rewrote prompt "${label}"; its original prompt function was not re-attached.`,
      );
    } else if (
      restored.some(
        (prompt) => prompt && typeof prompt.function !== 'function' && prompt.raw === original.raw,
      )
    ) {
      logger.warn(
        `beforeAll extension hook: prompt "${label}" carried a prompt function, but the hook returned its content under a different label. The function cannot be restored, so the prompt will render its raw source as text. Keep prompt labels unchanged to preserve prompt functions.`,
      );
    } else {
      logger.debug(
        `beforeAll extension hook removed prompt "${label}"; its prompt function no longer applies.`,
      );
    }
  }

  return restored;
}

export async function runExtensionHook<HookName extends keyof ExtensionHookContextMap>(
  extensions: string[] | null | undefined,
  hookName: HookName,
  context: ExtensionHookContextMap[HookName],
): Promise<ExtensionHookContextMap[HookName]> {
  if (!extensions || !Array.isArray(extensions) || extensions.length === 0) {
    return context;
  }

  telemetry.record('feature_used', {
    feature: 'extension_hook',
  });

  logger.debug(`Running ${hookName} hook with ${extensions.length} extension(s)`);

  let updatedContext: ExtensionHookContextMap[HookName] = { ...context };

  for (const extension of extensions) {
    invariant(typeof extension === 'string', 'extension must be a string');

    // Only run extensions that match the current hook name.
    // Extension format: file://path/to/file.js:functionName
    //
    // Behavior:
    // - If functionName is a known hook name (beforeAll, beforeEach, afterEach, afterAll),
    //   only run for that specific hook.
    // - If functionName is a custom name (e.g., myHandler, extension_hook),
    //   run for ALL hooks (generic handler pattern).
    // - If no functionName is specified, run for ALL hooks.
    const extensionHookName = getExtensionHookName(extension);
    if (
      extensionHookName &&
      EXTENSION_HOOK_NAMES.has(extensionHookName) &&
      extensionHookName !== hookName
    ) {
      logger.debug(
        `Skipping extension ${extension} for hook ${hookName} (extension targets ${extensionHookName} only)`,
      );
      continue;
    }

    // Determine calling convention based on function name:
    // - Known hook names (beforeAll, etc.) use NEW convention: (context, { hookName })
    //   These are hook-specific handlers that don't need hookName passed explicitly.
    // - Custom names or no function name use LEGACY convention: (hookName, context)
    //   These are generic handlers that need hookName to determine which hook is running.
    const useNewCallingConvention =
      extensionHookName && EXTENSION_HOOK_NAMES.has(extensionHookName);

    logger.debug(
      `Running extension ${extension} for hook ${hookName} (${useNewCallingConvention ? 'new' : 'legacy'} convention)`,
    );

    let extensionReturnValue;
    try {
      if (useNewCallingConvention) {
        // NEW convention: fn(context, { hookName })
        // Use updatedContext so each extension sees changes from previous extensions
        extensionReturnValue = await transform(extension, updatedContext, { hookName }, false);
      } else {
        // LEGACY convention: fn(hookName, context) - backwards compatible with pre-v0.102 hooks
        extensionReturnValue = await transform(extension, hookName, updatedContext, false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const wrappedError = new Error(
        `Extension hook "${hookName}" failed for ${extension}: ${errorMessage}`,
      );
      (wrappedError as Error & { cause?: unknown }).cause = error;
      throw wrappedError;
    }

    // If the extension hook returns a value, update the context with the value's mutable fields.
    // This also provides backwards compatibility for extension hooks that do not return a value.
    if (extensionReturnValue) {
      switch (hookName) {
        case 'beforeAll': {
          (updatedContext as BeforeAllExtensionHookContext) = {
            suite: {
              ...(updatedContext as BeforeAllExtensionHookContext).suite,
              // Mutable properties:
              prompts: restorePromptFunctions(
                extensionReturnValue.suite.prompts,
                (updatedContext as BeforeAllExtensionHookContext).suite.prompts,
              ),
              providerPromptMap: extensionReturnValue.suite.providerPromptMap,
              tests: extensionReturnValue.suite.tests,
              scenarios: extensionReturnValue.suite.scenarios,
              defaultTest: extensionReturnValue.suite.defaultTest,
              nunjucksFilters: extensionReturnValue.suite.nunjucksFilters,
              derivedMetrics: extensionReturnValue.suite.derivedMetrics,
              redteam: extensionReturnValue.suite.redteam,
            },
          };
          break;
        }
        case 'beforeEach': {
          (updatedContext as BeforeEachExtensionHookContext) = {
            test: extensionReturnValue.test,
          };
          break;
        }
        case 'afterEach': {
          if (extensionReturnValue.result) {
            const currentResult = (updatedContext as AfterEachExtensionHookContext).result;
            const mergedResponse =
              currentResult.response && extensionReturnValue.result.response?.metadata
                ? {
                    ...currentResult.response,
                    metadata: {
                      ...currentResult.response.metadata,
                      ...extensionReturnValue.result.response.metadata,
                    },
                  }
                : currentResult.response;
            const validScores = filterFiniteScores(extensionReturnValue.result.namedScores || {});
            (updatedContext as AfterEachExtensionHookContext) = {
              test: (updatedContext as AfterEachExtensionHookContext).test,
              result: {
                ...currentResult,
                namedScores: {
                  ...currentResult.namedScores,
                  ...validScores,
                },
                metadata: {
                  ...currentResult.metadata,
                  ...(extensionReturnValue.result.metadata || {}),
                },
                response: mergedResponse,
              },
            };
          }
          break;
        }
        // No case for 'afterAll': it runs after results are persisted and is
        // intended for side effects (monitoring, cleanup). Return values are
        // intentionally ignored since there is no downstream consumer.
      }
    }
  }

  return updatedContext;
}
