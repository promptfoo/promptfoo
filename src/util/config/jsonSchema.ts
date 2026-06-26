import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import $RefParser, {
  $Refs,
  getJsonSchemaRefParserDefaultOptions,
  InvalidPointerError,
  MissingPointerError,
  ResolverError,
} from '@apidevtools/json-schema-ref-parser';
import parseReferencedFile from '@apidevtools/json-schema-ref-parser/dist/lib/parse.js';

type MutableContainer = Record<string, unknown> | unknown[];
type SchemaSource = 'config' | 'tests';
type PlaceholderReplacement = { traverse: boolean; value: unknown };
type OrdinaryRefEdges = WeakMap<object, Map<string, string | null>>;
type OrdinaryRefPaths = Map<string, string | null>;
type RefPathNode = {
  logicalPath: string;
  parent?: RefPathNode;
  physicalPath: string;
};
type ShadowPathLayer = {
  emptyObjectPaths: PathTrieNode;
  parent?: ShadowPathLayer;
  paths: PathTrieNode;
};
type DereferenceOptions = {
  disabled?: boolean;
  jsonlRowRoots?: boolean;
  schemaFileBasePath?: string;
};

type ConfigDocument = {
  basePath: string;
  baseUrl?: string;
  cacheKey?: string;
  dynamicIdScope?: boolean;
  parserRoot?: unknown;
  root: unknown;
};

type SiblingScope = {
  document: ConfigDocument;
  referencePath?: string;
  terminal?: {
    document: ConfigDocument;
    documentPath?: string;
    referencePath?: string;
    target: unknown;
  };
};
type ExternalRefProvenance = {
  referencePath?: string;
  sourceCacheKey?: string;
  targetCacheKey?: string;
};

type ReferencedDocument = {
  basePath: string;
  baseUrl?: string;
  cacheKey: string;
  dynamicIdScope: boolean;
  value: unknown;
};
type ReferencedDocumentCache = Map<string, Promise<ReferencedDocument>>;
type LoadedDocumentReference = {
  basePath: string;
  baseUrl?: string;
  cacheKey: string;
  document: unknown;
  documentPath: string;
  dynamicIdScope: boolean;
  value: unknown;
};

type SelectedDocumentValue = { documentPath: string; value: unknown };

type ValueLocation = {
  parent: MutableContainer;
  key: string;
  path: string;
  value: unknown;
};

type TraversalItem = Partial<Pick<ValueLocation, 'key' | 'parent'>> & {
  ancestors?: ReadonlySet<object>;
  physicalPath: string;
  refPath?: RefPathNode;
  shadowedRefPaths?: ShadowPathLayer;
  path: string;
  value: unknown;
};

type SchemaRecord = {
  activationPaths: string[];
  detachPath?: string;
  ownerRefPaths: string[];
  outputPath: string;
  source: ValueLocation;
};

type SchemaState = {
  activationPaths: string[];
  detachPath?: string;
  forceParse?: boolean;
  outputPath: string;
  restoreValue: unknown;
  sources: ValueLocation[];
};

type PathTrieNode = {
  children: Map<string, PathTrieNode>;
  sourceStates?: number[];
  terminalPath?: string;
};

type SourcePath = {
  path: string;
  state: number;
};

type DisjointSet = {
  parents: number[];
  ranks: number[];
};

type CloneBudget = {
  aliasClones: number;
  seen: WeakSet<object>;
};

const MAX_ALIAS_CLONES = 50_000;

const SCHEMA_PATH_SUFFIX =
  /\/(?:format\/schema|generationConfig\/response_schema|outputType\/schema|output_schema|output_format\/schema|responseSchema|toolConfig\/tools\/\d+\/toolSpec\/inputSchema\/json|tools\/\d+\/(?:function\/parameters|functionDeclarations\/\d+\/(?:parameters|response)|input_schema|parameters|toolSpec\/inputSchema\/json)|functions\/\d+\/parameters|response_format\/(?:json_schema\/)?schema)$/;
const SCHEMA_PATH_PREFIX_SUFFIX =
  /\/(?:format(?:\/schema)?|generationConfig(?:\/response_schema)?|outputType(?:\/schema)?|output_schema|output_format(?:\/schema)?|responseSchema|toolConfig(?:\/tools(?:\/\d+(?:\/toolSpec(?:\/inputSchema(?:\/json)?)?)?)?)?|tools(?:\/\d+(?:\/(?:function(?:\/parameters)?|functionDeclarations(?:\/\d+(?:\/(?:parameters|response))?)?|input_schema|parameters|toolSpec(?:\/inputSchema(?:\/json)?)?))?)?|functions(?:\/\d+(?:\/parameters)?)?|response_format(?:\/(?:json_schema(?:\/schema)?|schema))?)$/;
const MAX_REF_PROVENANCE_PATHS = 50_000;
const MAX_REF_EXPANSION_PROPERTIES = 1_000_000;
const MAX_EXTERNAL_REF_PASSES = 64;

function countSchemaDiscoveryPath(count: number, refPath: RefPathNode | undefined): number {
  if (!refPath) {
    return count;
  }
  const nextCount = count + 1;
  if (nextCount > MAX_REF_PROVENANCE_PATHS) {
    throw new Error(
      `Config schema discovery exceeds the ${MAX_REF_PROVENANCE_PATHS.toLocaleString()} path safety limit`,
    );
  }
  return nextCount;
}

function collectRefPathNodes(refPath: RefPathNode | undefined): RefPathNode[] {
  const paths: RefPathNode[] = [];
  for (let current = refPath; current; current = current.parent) {
    paths.push(current);
  }
  return paths.reverse();
}

function isMutableContainer(value: unknown): value is MutableContainer {
  return typeof value === 'object' && value !== null;
}

function isMutableObject(value: unknown): value is Record<string, unknown> {
  return isMutableContainer(value) && !Array.isArray(value);
}

function hasOwn(value: MutableContainer, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function getValue(parent: MutableContainer, key: string): unknown {
  return (parent as Record<string, unknown>)[key];
}

function setValue(parent: MutableContainer, key: string, value: unknown): void {
  Object.defineProperty(parent, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function isJsonContainer(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (
    Array.isArray(value)
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  ) {
    return false;
  }
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Array.isArray(value) && key === 'length') {
      return Boolean(
        descriptor && 'value' in descriptor && !descriptor.enumerable && !descriptor.configurable,
      );
    }
    return Boolean(descriptor?.enumerable && 'value' in descriptor);
  });
}

function cloneConfigValue<T>(
  value: T,
  replacements: Map<object, PlaceholderReplacement>,
  budget: CloneBudget,
  originalRefs?: WeakMap<object, string>,
  rawSources?: WeakMap<object, object>,
  ancestors: object[] = [],
  ancestorClones: unknown[] = [],
): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  // A second clone can encounter an opaque placeholder created by the first clone. Preserve its
  // replacement metadata instead of treating the empty placeholder as ordinary JSON.
  const existingReplacement = replacements.get(value);
  if (existingReplacement) {
    const placeholder = {};
    replacements.set(placeholder, existingReplacement);
    rawSources?.set(placeholder, value);
    return placeholder as T;
  }

  // Programmatic configs can contain provider and SDK instances. Keep them opaque so cloning or
  // ref-parser traversal cannot strip prototypes, private state, accessors, or symbol properties.
  if (!isJsonContainer(value)) {
    const placeholder = {};
    replacements.set(placeholder, { traverse: false, value });
    rawSources?.set(placeholder, value);
    return placeholder as T;
  }

  const ancestorIndex = ancestors.indexOf(value);
  if (ancestorIndex !== -1) {
    return ancestorClones[ancestorIndex] as T;
  }

  if (budget.seen.has(value)) {
    budget.aliasClones++;
    if (budget.aliasClones > MAX_ALIAS_CLONES) {
      throw new Error(
        `Config alias expansion exceeds the ${MAX_ALIAS_CLONES.toLocaleString()} object safety limit`,
      );
    }
    const memo = new WeakMap<object, unknown>();
    for (let index = 0; index < ancestors.length; index++) {
      memo.set(ancestors[index], ancestorClones[index]);
    }
    return cloneConfigGraphValue(value, replacements, memo, originalRefs, rawSources);
  } else {
    budget.seen.add(value);
  }

  const result: unknown = Array.isArray(value)
    ? new Array(value.length)
    : Object.create(Object.getPrototypeOf(value));
  rawSources?.set(result as object, value);
  ancestors.push(value);
  ancestorClones.push(result);

  for (const key of Object.keys(value)) {
    const child =
      key === '$ref' && originalRefs?.has(value)
        ? originalRefs.get(value)
        : (value as Record<string, unknown>)[key];
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value: cloneConfigValue(
        child,
        replacements,
        budget,
        originalRefs,
        rawSources,
        ancestors,
        ancestorClones,
      ),
      writable: true,
    });
  }

  ancestors.pop();
  ancestorClones.pop();
  return result as T;
}

function cloneConfigGraphValue<T>(
  value: T,
  replacements: Map<object, PlaceholderReplacement>,
  memo: WeakMap<object, unknown>,
  originalRefs?: WeakMap<object, string>,
  rawSources?: WeakMap<object, object>,
): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (memo.has(value)) {
    return memo.get(value) as T;
  }

  const existingReplacement = replacements.get(value);
  if (existingReplacement) {
    const placeholder = {};
    memo.set(value, placeholder);
    replacements.set(placeholder, existingReplacement);
    rawSources?.set(placeholder, value);
    return placeholder as T;
  }
  if (!isJsonContainer(value)) {
    const placeholder = {};
    memo.set(value, placeholder);
    replacements.set(placeholder, { traverse: false, value });
    rawSources?.set(placeholder, value);
    return placeholder as T;
  }

  const result: MutableContainer = Array.isArray(value)
    ? new Array(value.length)
    : Object.create(Object.getPrototypeOf(value));
  memo.set(value, result);
  rawSources?.set(result, value);
  for (const key of Object.keys(value)) {
    const child =
      key === '$ref' && originalRefs?.has(value)
        ? originalRefs.get(value)
        : (value as Record<string, unknown>)[key];
    setValue(
      result,
      key,
      cloneConfigGraphValue(child, replacements, memo, originalRefs, rawSources),
    );
  }
  return result as T;
}

function cloneSchemaSnapshot<T>(
  value: T,
  replacements: Map<object, PlaceholderReplacement>,
  snapshots: WeakMap<object, unknown>,
  originalRefs: WeakMap<object, string>,
  rawSources: WeakMap<object, object>,
): T {
  return cloneConfigGraphValue(value, replacements, snapshots, originalRefs, rawSources);
}

function getParserReplayPlaceholder(
  value: unknown,
  replacements: Map<object, PlaceholderReplacement>,
): object | undefined {
  if (!isMutableContainer(value)) {
    return undefined;
  }
  const replacement = replacements.get(value);
  if (!replacement) {
    return undefined;
  }
  const placeholder = {};
  replacements.set(placeholder, replacement);
  return placeholder;
}

function hasParserReplayMask(
  value: unknown,
  replacements: Map<object, PlaceholderReplacement>,
): boolean {
  if (!isMutableContainer(value)) {
    return false;
  }
  const seen = new WeakSet<object>();
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (replacements.has(current)) {
      return true;
    }
    for (const key of Object.keys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor && 'value' in descriptor && isMutableContainer(descriptor.value)) {
        stack.push(descriptor.value);
      }
    }
  }
  return false;
}

type ParserReplayCloneContext = {
  maskReachable: WeakSet<object>;
  opaqueClones: WeakMap<object, unknown>;
  pairedClones: WeakMap<object, Array<{ clone: unknown; localized: object }>>;
  rawSources: WeakMap<object, object>;
  replacements: Map<object, PlaceholderReplacement>;
  sharedClones: WeakMap<object, unknown>;
};

function collectMaskReachable(
  localized: MutableContainer,
  replacements: Map<object, PlaceholderReplacement>,
): WeakSet<object> {
  const maskReachable = new WeakSet<object>();
  const parents = new WeakMap<object, Set<object>>();
  const visited = new WeakSet<object>();
  const stack = [localized];
  const pending: object[] = [];
  while (stack.length > 0) {
    const value = stack.pop()!;
    if (visited.has(value)) {
      continue;
    }
    visited.add(value);
    if (replacements.has(value)) {
      maskReachable.add(value);
      pending.push(value);
      continue;
    }
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !isMutableContainer(descriptor.value)) {
        continue;
      }
      const childParents = parents.get(descriptor.value) ?? new Set<object>();
      childParents.add(value);
      parents.set(descriptor.value, childParents);
      stack.push(descriptor.value);
    }
  }
  while (pending.length > 0) {
    const value = pending.pop()!;
    for (const parent of parents.get(value) ?? []) {
      if (!maskReachable.has(parent)) {
        maskReachable.add(parent);
        pending.push(parent);
      }
    }
  }
  return maskReachable;
}

function indexRefReachableObjects(
  root: unknown,
  indexed: WeakSet<object>,
  refReachable: WeakSet<object>,
): void {
  if (!isMutableContainer(root)) {
    return;
  }
  const parents = new WeakMap<object, Set<object>>();
  const visited = new WeakSet<object>();
  const pending: object[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const value = stack.pop()!;
    if (visited.has(value)) {
      continue;
    }
    visited.add(value);
    indexed.add(value);
    if (refReachable.has(value) || (!Array.isArray(value) && typeof value.$ref === 'string')) {
      if (!refReachable.has(value)) {
        refReachable.add(value);
      }
      pending.push(value);
    }
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const child = descriptor && 'value' in descriptor ? descriptor.value : undefined;
      if (isMutableContainer(child)) {
        const childParents = parents.get(child) ?? new Set<object>();
        childParents.add(value);
        parents.set(child, childParents);
        stack.push(child);
      }
    }
  }
  while (pending.length > 0) {
    const value = pending.pop()!;
    for (const parent of parents.get(value) ?? []) {
      if (!refReachable.has(parent)) {
        refReachable.add(parent);
        pending.push(parent);
      }
    }
  }
}

function getParserReplayClone(
  source: object,
  localized: MutableContainer | undefined,
  context: ParserReplayCloneContext,
): unknown {
  if (!localized || !context.maskReachable.has(localized)) {
    return context.sharedClones.get(source);
  }
  return context.pairedClones
    .get(source)
    ?.find(({ localized: candidate }) =>
      haveEquivalentParserReplayMasks(localized, candidate, context),
    )?.clone;
}

function rememberParserReplayClone(
  source: object,
  localized: MutableContainer | undefined,
  clone: MutableContainer,
  context: ParserReplayCloneContext,
): void {
  if (localized && context.maskReachable.has(localized)) {
    const paired = context.pairedClones.get(source) ?? [];
    paired.push({ clone, localized });
    context.pairedClones.set(source, paired);
  } else {
    context.sharedClones.set(source, clone);
  }
}

function haveEquivalentParserReplayMasks(
  left: object,
  right: object,
  context: ParserReplayCloneContext,
  visited = new WeakMap<object, WeakSet<object>>(),
): boolean {
  if (left === right) {
    return true;
  }
  const leftReplacement = context.replacements.get(left);
  const rightReplacement = context.replacements.get(right);
  if (leftReplacement || rightReplacement) {
    return Boolean(
      leftReplacement &&
        rightReplacement &&
        leftReplacement.traverse === rightReplacement.traverse &&
        (isMutableContainer(leftReplacement.value)
          ? (context.rawSources.get(leftReplacement.value) ?? leftReplacement.value)
          : leftReplacement.value) ===
          (isMutableContainer(rightReplacement.value)
            ? (context.rawSources.get(rightReplacement.value) ?? rightReplacement.value)
            : rightReplacement.value),
    );
  }
  const leftMasked = context.maskReachable.has(left);
  const rightMasked = context.maskReachable.has(right);
  if (!leftMasked || !rightMasked) {
    return leftMasked === rightMasked;
  }

  const rightViews = visited.get(left) ?? new WeakSet<object>();
  if (rightViews.has(right)) {
    return true;
  }
  rightViews.add(right);
  visited.set(left, rightViews);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const leftChild = Object.getOwnPropertyDescriptor(left, key)?.value;
    const rightChild = Object.getOwnPropertyDescriptor(right, key)?.value;
    const leftChildMasked = isMutableContainer(leftChild) && context.maskReachable.has(leftChild);
    const rightChildMasked =
      isMutableContainer(rightChild) && context.maskReachable.has(rightChild);
    if (leftChildMasked !== rightChildMasked) {
      return false;
    }
    if (
      leftChildMasked &&
      !haveEquivalentParserReplayMasks(leftChild, rightChild as object, context, visited)
    ) {
      return false;
    }
  }
  return true;
}

function cloneParserReplayValue(
  source: unknown,
  localized: unknown,
  context: ParserReplayCloneContext,
): unknown {
  const placeholder = getParserReplayPlaceholder(localized, context.replacements);
  if (placeholder || !isMutableContainer(source)) {
    return placeholder ?? source;
  }
  if (!isJsonContainer(source)) {
    if (!context.opaqueClones.has(source)) {
      context.opaqueClones.set(source, structuredClone(source));
    }
    return context.opaqueClones.get(source);
  }

  const localizedContainer = isMutableContainer(localized) ? localized : undefined;
  const cached = getParserReplayClone(source, localizedContainer, context);
  if (cached !== undefined) {
    return cached;
  }
  const clone: MutableContainer = Array.isArray(source)
    ? new Array(source.length)
    : Object.create(Object.getPrototypeOf(source));
  rememberParserReplayClone(source, localizedContainer, clone, context);
  for (const key of Object.keys(source)) {
    const descriptor = localizedContainer
      ? Object.getOwnPropertyDescriptor(localizedContainer, key)
      : undefined;
    const localizedChild =
      descriptor && 'value' in descriptor ? descriptor.value : getValue(source, key);
    setValue(clone, key, cloneParserReplayValue(getValue(source, key), localizedChild, context));
  }
  return clone;
}

function cloneParserReplayDocument(
  source: unknown,
  localized: unknown,
  replacements: Map<object, PlaceholderReplacement>,
  rawSources: WeakMap<object, object>,
): unknown {
  if (!isMutableContainer(source) || !isJsonContainer(source)) {
    return source;
  }
  const rootPlaceholder = getParserReplayPlaceholder(localized, replacements);
  if (rootPlaceholder) {
    return rootPlaceholder;
  }
  if (!isMutableContainer(localized)) {
    return structuredClone(source);
  }
  return cloneParserReplayValue(source, localized, {
    maskReachable: collectMaskReachable(localized, replacements),
    opaqueClones: new WeakMap<object, unknown>(),
    pairedClones: new WeakMap<object, Array<{ clone: unknown; localized: object }>>(),
    rawSources,
    replacements,
    sharedClones: new WeakMap<object, unknown>(),
  });
}

function hasRepeatedJsonIdentity(value: unknown): boolean {
  if (!isMutableContainer(value)) {
    return false;
  }
  const seen = new WeakSet<object>();
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) {
      return true;
    }
    seen.add(current);
    if (!isJsonContainer(current)) {
      continue;
    }
    for (const key of Object.keys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor && 'value' in descriptor && isMutableContainer(descriptor.value)) {
        stack.push(descriptor.value);
      }
    }
  }
  return false;
}

function joinPointer(path: string, key: string): string {
  return `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function joinParserRefPointer(path: string, key: string): string | undefined {
  // RefParser normalizes URL fragments twice before it decodes JSON Pointer tokens.
  const pointerToken = key.replace(/~/g, '~0').replace(/\//g, '~1');
  try {
    return `${path}/${encodeURIComponent(encodeURIComponent(pointerToken))}`;
  } catch {
    return undefined;
  }
}

function resolveUrlPreservingTrailingWhitespace(ref: string, base: string): string {
  const trailingWhitespace = ref.match(/(\s*)$/)?.[1] ?? '';
  return `${new URL(ref, base).toString()}${trailingWhitespace}`;
}

function normalizeUrlPreservingTrailingWhitespace(ref: string): string {
  const trailingWhitespace = ref.match(/(\s*)$/)?.[1] ?? '';
  return `${new URL(ref).toString()}${trailingWhitespace}`;
}

function usesDynamicIdScope(value: unknown): boolean {
  if (!isMutableContainer(value) || ArrayBuffer.isView(value)) {
    return false;
  }
  const schema = Array.isArray(value) ? undefined : value.$schema;
  if (
    typeof schema === 'string' &&
    (schema.includes('draft/2019-09/') ||
      schema.includes('draft/2020-12/') ||
      schema.includes('oas/3.1/'))
  ) {
    return true;
  }
  const openapi = Array.isArray(value) ? undefined : value.openapi;
  return typeof openapi === 'string' && /^3\.1(?:\.|$)/.test(openapi);
}

function getSchemaBasePath(basePath: string, value: MutableContainer): string {
  const id = !Array.isArray(value) && typeof value.$id === 'string' ? value.$id : undefined;
  return id ? resolveUrlPreservingTrailingWhitespace(id, basePath) : basePath;
}

function normalizeRefFragment(fragment: string, documentRef: string): string {
  let resolved = fragment;
  for (let pass = 0; pass < 2; pass++) {
    const normalized = resolveUrlPreservingTrailingWhitespace(resolved, documentRef);
    const [base, hash] = normalized.split('#', 2);
    resolved = `${base}#${decodeURIComponent(hash || '')}`;
  }
  return resolved.slice(resolved.indexOf('#'));
}

function hasNamedFragment(ref: string, documentRef: string): boolean {
  const fragmentIndex = ref.indexOf('#');
  if (fragmentIndex === -1) {
    return false;
  }
  try {
    const fragment = normalizeRefFragment(ref.slice(fragmentIndex), documentRef);
    return fragment !== '#' && !fragment.startsWith('#/');
  } catch {
    return false;
  }
}

export function getLocalRefTokens(ref: string): string[] | undefined {
  try {
    const fragment = normalizeRefFragment(ref, 'file:///__promptfoo_root__.json');
    return fragment.startsWith('#/')
      ? fragment
          .slice(2)
          .split('/')
          .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'))
      : undefined;
  } catch {
    return undefined;
  }
}

function resolvePointerTokens(
  root: unknown,
  tokens: string[] | undefined,
): ValueLocation | undefined {
  if (!tokens || tokens.length === 0 || !isMutableContainer(root)) {
    return undefined;
  }
  let current: unknown = root;
  let parent: MutableContainer = root;
  let key = '';

  for (let index = 0; index < tokens.length; index++) {
    if (!isMutableContainer(current)) {
      return undefined;
    }
    let token = tokens[index];
    if (!hasOwn(current, token)) {
      for (let end = tokens.length - 1; end > index; end--) {
        const joined = tokens.slice(index, end + 1).join('/');
        if (hasOwn(current, joined)) {
          token = joined;
          index = end;
          break;
        }
      }
      if (!hasOwn(current, token)) {
        return undefined;
      }
    }
    parent = current;
    key = token;
    current = getValue(current, token);
  }

  return { parent, key, path: tokens.reduce(joinPointer, '#'), value: current };
}

function resolveLocalPointer(root: unknown, ref: string): ValueLocation | undefined {
  return resolvePointerTokens(root, getLocalRefTokens(ref));
}

function rebaseJsonlRowRefs(rows: unknown[], originalRefs: WeakMap<object, string>): void {
  const visited = new WeakMap<object, Set<number>>();
  const stack = rows.map((value, rowIndex) => ({ rowIndex, value }));

  while (stack.length > 0) {
    const { rowIndex, value } = stack.pop()!;
    if (!isMutableContainer(value)) {
      continue;
    }
    const visitedRows = visited.get(value) ?? new Set<number>();
    if (visitedRows.has(rowIndex)) {
      continue;
    }
    visitedRows.add(rowIndex);
    visited.set(value, visitedRows);

    if (!Array.isArray(value) && typeof value.$ref === 'string' && value.$ref.startsWith('#')) {
      const ref = value.$ref;
      const tokens = ref === '#' ? [] : getLocalRefTokens(ref);
      if (tokens) {
        const firstToken = tokens[0];
        const selectsAnotherRow =
          firstToken !== undefined &&
          /^(?:0|[1-9]\d*)$/.test(firstToken) &&
          Number(firstToken) < rows.length &&
          !resolvePointerTokens(rows[rowIndex], tokens);
        if (!selectsAnotherRow) {
          const rebasedRef = tokens.reduce<string | undefined>(
            (path, token) => (path ? joinParserRefPointer(path, token) : undefined),
            joinPointer('#', String(rowIndex)),
          );
          if (rebasedRef) {
            originalRefs.set(value, ref);
            setValue(value, '$ref', rebasedRef);
          }
        }
      }
    }

    for (const child of Object.values(value)) {
      stack.push({ rowIndex, value: child });
    }
  }
}

function resolveCanonicalPointer(root: unknown, path: string): ValueLocation | undefined {
  const tokens = path.startsWith('#/')
    ? path
        .slice(2)
        .split('/')
        .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'))
    : undefined;
  return resolvePointerTokens(root, tokens);
}

function getPureRef(value: unknown): string | undefined {
  if (!isMutableContainer(value) || Array.isArray(value)) {
    return undefined;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && typeof value.$ref === 'string' ? value.$ref : undefined;
}

function getTestPathSuffix(path: string, source: SchemaSource): string | undefined {
  const match =
    source === 'tests'
      ? path.match(/^#(?:\/\d+)?(.*)$/)
      : path.match(/^#\/(?:defaultTest|tests\/\d+|scenarios\/\d+\/(?:config|tests)\/\d+)(.*)$/);
  return match?.[1];
}

function isSchemaOwnerPath(path: string, source: SchemaSource): boolean {
  const ownerPath = path.replace(/(?:\/agent)?(?:\/handoffs\/\d+\/agent)*$/, '');
  if (
    /^#\/(?:providers|targets)\/\d+(?:\/[^/]+)?\/config$/.test(ownerPath) ||
    /^#\/prompts\/\d+(?:\/[^/]+)?\/config$/.test(ownerPath) ||
    /^#\/redteam\/provider(?:\/[^/]+)?\/config$/.test(ownerPath)
  ) {
    return true;
  }

  const suffix = getTestPathSuffix(ownerPath, source);
  if (suffix === undefined) {
    return false;
  }
  return (
    suffix === '/options' ||
    /^(?:\/assert\/\d+)*\/provider(?:\/[^/]+)?\/config$/.test(suffix) ||
    /^\/options\/provider(?:\/[^/]+)?\/config$/.test(suffix)
  );
}

function isStandaloneSchemaPath(path: string, source: SchemaSource): boolean {
  const suffix = path.match(SCHEMA_PATH_SUFFIX)?.[0];
  return Boolean(suffix && isSchemaOwnerPath(path.slice(0, -suffix.length), source));
}

function isAssertionSchemaPath(
  path: string,
  parent: MutableContainer,
  source: SchemaSource,
): boolean {
  const suffix = getTestPathSuffix(path, source);
  if (!suffix || !/^(?:\/assert\/\d+)+\/value$/.test(suffix) || Array.isArray(parent)) {
    return false;
  }
  const assertionType = (parent as Record<string, unknown>).type;
  return typeof assertionType === 'string' && /^(?:not-)?(?:is|contains)-json$/.test(assertionType);
}

function canFollowSchemaRef(path: string, source: SchemaSource): boolean {
  if (path === '#' || isSchemaOwnerPath(path, source)) {
    return true;
  }
  if (
    source === 'config' &&
    (/^#\/(?:providers|targets|prompts|tests|scenarios)$/.test(path) ||
      /^#\/(?:providers|targets|prompts)\/\d+(?:\/[^/]+)?(?:\/config)?$/.test(path) ||
      /^#\/redteam(?:\/provider(?:\/[^/]+)?(?:\/config)?)?$/.test(path) ||
      /^#\/scenarios\/\d+(?:\/(?:config|tests))?$/.test(path))
  ) {
    return true;
  }

  const testSuffix = getTestPathSuffix(path, source);
  if (
    testSuffix !== undefined &&
    (/^(?:\/assert\/\d+)*(?:\/assert)?$/.test(testSuffix) ||
      /^(?:\/assert\/\d+)*\/(?:options|provider(?:\/[^/]+)?(?:\/config)?)$/.test(testSuffix) ||
      /^\/options\/provider(?:\/[^/]+)?(?:\/config)?$/.test(testSuffix))
  ) {
    return true;
  }

  const handoffContainer = path.match(/\/handoffs(?:\/\d+)?$/)?.[0];
  if (handoffContainer && isSchemaOwnerPath(path.slice(0, -handoffContainer.length), source)) {
    return true;
  }

  const schemaPrefix = path.match(SCHEMA_PATH_PREFIX_SUFFIX)?.[0];
  return Boolean(schemaPrefix && isSchemaOwnerPath(path.slice(0, -schemaPrefix.length), source));
}

function collectStandaloneSchemaLocations(
  root: unknown,
  source: SchemaSource,
): { ownerRefPaths: Set<string>; records: Map<string, SchemaRecord> } {
  const records = new Map<string, SchemaRecord>();
  const ownerRefPaths = new Set<string>();
  const visited = new WeakMap<object, Set<string>>();
  const stack: TraversalItem[] = [{ path: '#', physicalPath: '#', value: root }];
  let schemaDiscoveryPaths = 0;

  const addRecord = (record: SchemaRecord) => {
    const previous = records.get(record.outputPath);
    if (!previous || record.source.path === record.outputPath) {
      records.set(record.outputPath, record);
    }
    for (const path of record.ownerRefPaths) {
      ownerRefPaths.add(path);
    }
  };

  while (stack.length > 0) {
    const { ancestors, key, parent, path, physicalPath, refPath, value } = stack.pop()!;
    schemaDiscoveryPaths = countSchemaDiscoveryPath(schemaDiscoveryPaths, refPath);
    if (
      key !== undefined &&
      parent &&
      (isStandaloneSchemaPath(path, source) || isAssertionSchemaPath(path, parent, source))
    ) {
      const refPaths = collectRefPathNodes(refPath);
      let detachPath = refPaths.find(
        (refPath) => refPath.logicalPath !== '#' && path.startsWith(`${refPath.logicalPath}/`),
      )?.logicalPath;
      if (!detachPath && refPaths.some((refPath) => refPath.logicalPath === '#')) {
        detachPath = path.match(/^#\/[^/]+/)?.[0];
      }
      addRecord({
        activationPaths: refPaths.map((refPath) =>
          path.startsWith(refPath.logicalPath)
            ? `${refPath.physicalPath}${path.slice(refPath.logicalPath.length)}`
            : refPath.physicalPath,
        ),
        detachPath,
        ownerRefPaths: refPaths.map((refPath) => refPath.physicalPath),
        outputPath: path,
        source: { key, parent, path: physicalPath, value },
      });
      continue;
    }
    if (!isMutableContainer(value)) {
      continue;
    }
    if (ancestors?.has(value)) {
      continue;
    }

    const visitedPaths = visited.get(value) ?? new Set<string>();
    if (visitedPaths.has(path)) {
      continue;
    }
    visitedPaths.add(path);
    visited.set(value, visitedPaths);

    const childAncestors = new Set(ancestors);
    childAncestors.add(value);

    if (
      !Array.isArray(value) &&
      typeof value.$ref === 'string' &&
      canFollowSchemaRef(path, source)
    ) {
      const target = resolveLocalPointer(root, value.$ref);
      if (target && target.value !== value) {
        ownerRefPaths.add(physicalPath);
        stack.push({
          ...target,
          ancestors,
          physicalPath: target.path,
          refPath: { logicalPath: path, parent: refPath, physicalPath },
          path,
        });
      }
    }

    for (const [childKey, child] of Object.entries(value)) {
      const childPath = joinPointer(path, childKey);
      if (
        !canFollowSchemaRef(childPath, source) &&
        !isStandaloneSchemaPath(childPath, source) &&
        !isAssertionSchemaPath(childPath, value, source)
      ) {
        continue;
      }
      stack.push({
        key: childKey,
        parent: value,
        ancestors: childAncestors,
        path: childPath,
        physicalPath: joinPointer(physicalPath, childKey),
        refPath,
        value: child,
      });
    }
  }

  return { ownerRefPaths, records };
}

function resolveConfigLevelSchemaRef(
  root: unknown,
  schema: unknown,
): { locations: ValueLocation[]; unresolved: boolean; value: unknown } | undefined {
  let ref = getPureRef(schema);
  if (!ref?.startsWith('#/')) {
    return undefined;
  }

  const locations: ValueLocation[] = [];
  const seenRefs = new Set<string>();
  let value: unknown = schema;

  while (ref.startsWith('#/') && !seenRefs.has(ref)) {
    seenRefs.add(ref);
    const location = resolveLocalPointer(root, ref);
    if (!location) {
      return { locations, unresolved: true, value };
    }
    locations.push(location);
    value = location.value;
    ref = getPureRef(value) ?? '';
  }

  return { locations, unresolved: false, value };
}

function getSchemaFileLocation(documentRef: string, basePath: string) {
  const promptfooPath = documentRef.slice('file://'.length);
  let documentBasePath: string;
  let fallbackBasePath: string | undefined;
  let fallbackCacheKey: string | undefined;
  let fallbackParseRef: string | undefined;
  let cacheKey: string;
  let parseRef: string;
  if (
    !promptfooPath.startsWith('/') &&
    !/^localhost\//i.test(promptfooPath) &&
    !/^[A-Za-z]:[\\/]/.test(promptfooPath)
  ) {
    const directoryUrl = pathToFileURL(resolve(basePath, '.')).href;
    parseRef = resolveUrlPreservingTrailingWhitespace(
      promptfooPath,
      directoryUrl.endsWith('/') ? directoryUrl : `${directoryUrl}/`,
    );
    documentBasePath = fileURLToPath(new URL('.', parseRef));
    cacheKey = normalizeUrlPreservingTrailingWhitespace(parseRef);
    if (process.platform === 'win32') {
      try {
        fallbackBasePath = fileURLToPath(new URL('.', documentRef));
        fallbackCacheKey = normalizeUrlPreservingTrailingWhitespace(documentRef);
        fallbackParseRef = documentRef;
      } catch {
        // Non-standard Promptfoo-relative file reference with no UNC interpretation.
      }
    }
  } else {
    try {
      documentBasePath = fileURLToPath(new URL('.', documentRef));
      cacheKey = normalizeUrlPreservingTrailingWhitespace(documentRef);
      parseRef = cacheKey;
    } catch {
      // Keep Promptfoo's non-standard file://C:/... shorthand on Windows.
      documentBasePath = dirname(promptfooPath);
      cacheKey = pathToFileURL(promptfooPath).href;
      parseRef = promptfooPath;
    }
  }
  return {
    cacheKey,
    documentBasePath,
    fallbackBasePath,
    fallbackCacheKey,
    fallbackParseRef,
    parseRef,
  };
}

function selectSchemaFileFragment(
  document: unknown,
  fragment: string,
  ref: string,
  documentRef: string,
  parentPath?: string,
): SelectedDocumentValue {
  fragment = normalizeRefFragment(fragment, documentRef);
  if (fragment === '#') {
    return { documentPath: '#', value: document };
  }
  if (!fragment.startsWith('#/')) {
    throw new InvalidPointerError(fragment.slice(1), ref);
  }

  const pointerTokens = fragment
    .slice(2)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = document;
  const found: string[] = [];
  for (let index = 0; index < pointerTokens.length; index++) {
    let token = pointerTokens[index];
    if (current === null || current === undefined) {
      throw new TypeError(`Cannot read properties of ${current} (reading '${token}')`);
    }
    const container = Object(current) as Record<string, unknown>;
    if (!(token in container)) {
      for (let end = pointerTokens.length - 1; end > index; end--) {
        const joined = pointerTokens.slice(index, end + 1).join('/');
        if (joined in container) {
          token = joined;
          index = end;
          break;
        }
      }
    }
    if (!(token in container)) {
      throw new MissingPointerError(
        token,
        ref,
        fragment,
        found.reduce(joinPointer, '#'),
        parentPath,
      );
    }
    current = container[token];
    found.push(token);
  }
  return { documentPath: found.reduce(joinPointer, '#'), value: current };
}

async function parseReferencedDocument(ref: string): Promise<unknown> {
  return parseReferencedFile(ref, new $Refs(), getJsonSchemaRefParserDefaultOptions());
}

async function loadSchemaFileReference(
  ref: string,
  documents: ReferencedDocumentCache,
  basePath: string,
  parentPath?: string,
): Promise<LoadedDocumentReference> {
  const fragmentIndex = ref.indexOf('#');
  const documentRef = fragmentIndex === -1 ? ref : ref.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? undefined : ref.slice(fragmentIndex);
  const {
    cacheKey,
    documentBasePath,
    fallbackBasePath,
    fallbackCacheKey,
    fallbackParseRef,
    parseRef,
  } = getSchemaFileLocation(documentRef, basePath);
  let pendingDocument = documents.get(cacheKey);
  if (!pendingDocument) {
    const parseDocument = (loadedBasePath: string, documentKey: string, reference: string) =>
      parseReferencedDocument(reference).then((value) => ({
        basePath: loadedBasePath,
        baseUrl: documentKey,
        cacheKey: documentKey,
        dynamicIdScope: usesDynamicIdScope(value),
        value,
      }));
    pendingDocument = parseDocument(documentBasePath, cacheKey, parseRef).catch((error) => {
      if (
        fallbackBasePath &&
        fallbackCacheKey &&
        error instanceof ResolverError &&
        error.ioErrorCode === 'ENOENT'
      ) {
        let fallbackDocument =
          fallbackCacheKey === cacheKey ? undefined : documents.get(fallbackCacheKey);
        if (!fallbackDocument) {
          fallbackDocument = parseDocument(
            fallbackBasePath,
            fallbackCacheKey,
            fallbackParseRef ?? fallbackCacheKey,
          );
          if (fallbackCacheKey !== cacheKey) {
            documents.set(fallbackCacheKey, fallbackDocument);
          }
        }
        return fallbackDocument;
      }
      throw error;
    });
    documents.set(cacheKey, pendingDocument);
  }
  const loadedDocument = await pendingDocument;
  const document = loadedDocument.value;
  const selected =
    !fragment || fragment === '#'
      ? { documentPath: '#', value: document }
      : selectSchemaFileFragment(document, fragment, ref, loadedDocument.cacheKey, parentPath);
  return {
    basePath: loadedDocument.basePath,
    baseUrl: loadedDocument.baseUrl,
    cacheKey: loadedDocument.cacheKey,
    document,
    documentPath: selected.documentPath,
    dynamicIdScope: loadedDocument.dynamicIdScope,
    value: selected.value,
  };
}

async function loadRemoteDocumentReference(
  ref: string,
  documents: ReferencedDocumentCache,
  parentPath?: string,
): Promise<LoadedDocumentReference> {
  const fragmentIndex = ref.indexOf('#');
  const fragment = fragmentIndex === -1 ? '' : ref.slice(fragmentIndex);
  const parsedRef = new URL(ref);
  parsedRef.hash = '';
  const cacheKey = parsedRef.toString();
  let pendingDocument = documents.get(cacheKey);
  if (!pendingDocument) {
    pendingDocument = parseReferencedDocument(cacheKey).then((value) => ({
      basePath: '',
      baseUrl: cacheKey,
      cacheKey,
      dynamicIdScope: usesDynamicIdScope(value),
      value,
    }));
    documents.set(cacheKey, pendingDocument);
  }
  const loadedDocument = await pendingDocument;
  const document = loadedDocument.value;
  const selected =
    !fragment || fragment === '#'
      ? { documentPath: '#', value: document }
      : selectSchemaFileFragment(document, fragment, ref, cacheKey, parentPath);
  return {
    basePath: '',
    baseUrl: cacheKey,
    cacheKey,
    document,
    documentPath: selected.documentPath,
    dynamicIdScope: loadedDocument.dynamicIdScope,
    value: selected.value,
  };
}

function resolveDocumentRef(ref: string, document: ConfigDocument): string | undefined {
  if (/^file:\/\//i.test(ref) || /^https?:\/\//i.test(ref)) {
    return ref;
  }
  if (ref.startsWith('#') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref)) {
    return undefined;
  }
  if (document.baseUrl) {
    return resolveUrlPreservingTrailingWhitespace(ref, document.baseUrl);
  }
  const directoryUrl = pathToFileURL(resolve(document.basePath, '.')).href;
  const baseUrl =
    document.cacheKey ?? (directoryUrl.endsWith('/') ? directoryUrl : `${directoryUrl}/`);
  return resolveUrlPreservingTrailingWhitespace(ref, baseUrl);
}

function canonicalLocalRefPath(ref: string): string | undefined {
  if (ref === '#') {
    return '#';
  }
  return getLocalRefTokens(ref)?.reduce(joinPointer, '#');
}

function selectMountedDocumentTarget(
  document: unknown,
  ref: string,
  documentRef: string,
  parentPath?: string,
): SelectedDocumentValue {
  const fragmentIndex = ref.indexOf('#');
  if (fragmentIndex === -1 || fragmentIndex === ref.length - 1) {
    return { documentPath: '#', value: document };
  }
  return selectSchemaFileFragment(document, ref.slice(fragmentIndex), ref, documentRef, parentPath);
}

function indexMountedTargetPaths(
  target: unknown,
  targetPath: string,
  targetPaths: WeakMap<object, string>,
): void {
  if (!isMutableContainer(target)) {
    return;
  }
  const stack: Array<{ path: string; value: unknown }> = [{ path: targetPath, value: target }];
  while (stack.length > 0) {
    const item = stack.pop()!;
    if (!isMutableContainer(item.value) || targetPaths.has(item.value)) {
      continue;
    }
    targetPaths.set(item.value, item.path);
    for (const [key, child] of Object.entries(item.value)) {
      const childPath = joinParserRefPointer(item.path, key);
      if (childPath) {
        stack.push({ path: childPath, value: child });
      }
    }
  }
}

function appendReferencePath(referencePath: string | undefined, key: string): string | undefined {
  if (!referencePath) {
    return undefined;
  }
  const fragmentIndex = referencePath.indexOf('#');
  const documentRef = fragmentIndex === -1 ? referencePath : referencePath.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? '#' : referencePath.slice(fragmentIndex);
  return `${documentRef}${joinPointer(fragment, key)}`;
}

function getScopedCloneChild(
  value: MutableContainer,
  key: string,
  scopeKey: string,
  scopedTargets: WeakMap<object, Map<string, unknown>>,
  originalRefs: WeakMap<object, string>,
  cloneValue: (value: unknown) => unknown,
): unknown {
  const child =
    key === '$ref' && originalRefs.has(value) ? originalRefs.get(value) : getValue(value, key);
  if (!isMutableContainer(child)) {
    return child;
  }
  const childViews = scopedTargets.get(child);
  if (childViews?.has(scopeKey)) {
    return childViews.get(scopeKey);
  }
  if (Array.isArray(child)) {
    return child;
  }
  const refDescriptor = Object.getOwnPropertyDescriptor(child, '$ref');
  return refDescriptor && 'value' in refDescriptor && typeof refDescriptor.value === 'string'
    ? cloneValue(child)
    : child;
}

async function localizeExternalConfigRefs(
  root: MutableContainer,
  source: SchemaSource,
  replacements: Map<object, PlaceholderReplacement>,
  cloneBudget: CloneBudget,
  rawSources: WeakMap<object, object>,
  originalRefs: WeakMap<object, string>,
  schemaFileDocuments: ReferencedDocumentCache,
  schemaFileBasePath: string,
): Promise<{
  finish: (maskedRoots: WeakSet<object>) => Promise<void>;
  getMount: () => { key: string; value: unknown[] } | undefined;
  getParserDocument: (cacheKey: string) => unknown;
  getRefProvenance: (value: object) => ExternalRefProvenance | undefined;
  getRevision: () => number;
  isReplayDocument: (url: string) => boolean;
  prepareParserReplay: () => boolean;
}> {
  const mountKey = `__promptfoo_external_refs_${randomUUID()}`;
  const mountPath = joinPointer('#', mountKey);
  const targets: unknown[] = [];
  const targetPaths = new WeakMap<object, string>();
  const mountedDocuments = new Map<string, ConfigDocument>();
  const parserDocuments = new Map<string, unknown>();
  const identityCheckedDocuments = new Set<string>();
  const rawReplayCandidates = new Set<string>();
  const rawReplayDocuments = new Set<string>();
  const cyclicTargets = new WeakSet<object>();
  const siblingScopeCache = new WeakMap<object, Map<string, Promise<SiblingScope>>>();
  const scopedTargets = new WeakMap<object, Map<string, unknown>>();
  const externalConfigConsumers = new Map<
    MutableContainer,
    { cacheKey?: string; referencePath: string; target: unknown }
  >();
  const localizedRefs = new WeakMap<
    object,
    {
      document: ConfigDocument;
      documentPath?: string;
      loadedDocument: boolean;
      referencePath?: string;
      schemaDocumentLoaded: boolean;
      sourceCacheKey?: string;
      target: unknown;
      targetCacheKey?: string;
    }
  >();
  let revision = 0;
  const traversalBudget = { refPaths: 0 };
  const indexedRefObjects = new WeakSet<object>();
  const refReachable = new WeakSet<object>();
  indexRefReachableObjects(root, indexedRefObjects, refReachable);

  const getLocalizationPureRef = (value: unknown): string | undefined => {
    const ref = getPureRef(value);
    if (ref || value !== root || !isMutableContainer(value) || Array.isArray(value)) {
      return ref;
    }
    const keys = Object.keys(value).filter((key) => key !== mountKey);
    return keys.length === 1 && keys[0] === '$ref' && typeof value.$ref === 'string'
      ? value.$ref
      : undefined;
  };

  const addTarget = (target: unknown): string => {
    if (isMutableContainer(target)) {
      const existing = targetPaths.get(target);
      if (existing) {
        return existing;
      }
    }
    if (targets.length === 0) {
      Object.defineProperty(root, mountKey, {
        configurable: true,
        enumerable: true,
        value: targets,
        writable: true,
      });
    }
    const path = joinPointer(mountPath, String(targets.length));
    let mountedTarget = target;
    if (target === undefined) {
      const placeholder = {};
      mountedTarget = placeholder;
      replacements.set(placeholder, { traverse: false, value: undefined });
    }
    Object.defineProperty(targets, String(targets.length), {
      configurable: true,
      enumerable: false,
      value: mountedTarget,
      writable: true,
    });
    indexMountedTargetPaths(target, path, targetPaths);
    return path;
  };

  const rewriteRef = (
    value: Record<string, unknown>,
    target: unknown,
    document: ConfigDocument,
    documentPath: string | undefined,
    loadedDocument: boolean,
    referencePath: string | undefined,
    schemaDocumentLoaded: boolean,
    sourceCacheKey: string | undefined,
  ): void => {
    const ref = value.$ref as string;
    if (!originalRefs.has(value)) {
      originalRefs.set(value, ref);
      revision++;
      if (revision > MAX_REF_PROVENANCE_PATHS) {
        throw new Error(
          `Config external ref localization exceeds the ${MAX_REF_PROVENANCE_PATHS.toLocaleString()} path safety limit`,
        );
      }
    }
    localizedRefs.set(value, {
      document,
      documentPath,
      loadedDocument,
      referencePath,
      schemaDocumentLoaded,
      sourceCacheKey,
      target,
      targetCacheKey: document.cacheKey,
    });
    setValue(value, '$ref', addTarget(target));
  };

  const loadTarget = async (
    ref: string,
    parentDocument: ConfigDocument,
    schemaBoundary: boolean,
    parentPath: string,
  ): Promise<{ document: ConfigDocument; documentPath: string; target: unknown }> => {
    const errorParentPath = parentPath.startsWith('#') ? resolve(parentPath) : parentPath;
    const loaded = /^https?:\/\//i.test(ref)
      ? await loadRemoteDocumentReference(ref, schemaFileDocuments, errorParentPath)
      : await loadSchemaFileReference(
          ref,
          schemaFileDocuments,
          parentDocument.basePath,
          errorParentPath,
        );
    if (!identityCheckedDocuments.has(loaded.cacheKey)) {
      identityCheckedDocuments.add(loaded.cacheKey);
      if (hasRepeatedJsonIdentity(loaded.document)) {
        rawReplayCandidates.add(loaded.cacheKey);
      }
    }
    const viewKey = `${loaded.cacheKey}\0${schemaBoundary ? 'schema' : 'config'}`;
    let document = mountedDocuments.get(viewKey);
    if (!document) {
      document = {
        basePath: loaded.basePath,
        baseUrl: loaded.baseUrl,
        cacheKey: loaded.cacheKey,
        dynamicIdScope: loaded.dynamicIdScope,
        parserRoot: loaded.document,
        root: schemaBoundary
          ? cloneConfigGraphValue(
              loaded.document,
              replacements,
              new WeakMap<object, unknown>(),
              undefined,
              rawSources,
            )
          : cloneConfigValue(loaded.document, replacements, cloneBudget, undefined, rawSources),
      };
      mountedDocuments.set(viewKey, document);
      indexRefReachableObjects(document.root, indexedRefObjects, refReachable);
    }
    if (!schemaBoundary) {
      addTarget(document.root);
    }
    const opaqueDocument = isMutableContainer(loaded.document) && !isJsonContainer(loaded.document);
    const selected = opaqueDocument
      ? {
          documentPath: loaded.documentPath,
          value:
            loaded.value === loaded.document
              ? document.root
              : cloneConfigValue(loaded.value, replacements, cloneBudget, undefined, rawSources),
        }
      : selectMountedDocumentTarget(document.root, ref, document.cacheKey!, errorParentPath);
    return {
      document,
      documentPath: selected.documentPath,
      target: selected.value,
    };
  };

  type LocalizationItem = Partial<Pick<ValueLocation, 'key' | 'parent'>> & {
    ancestors?: ReadonlySet<object>;
    document: ConfigDocument;
    documentPath?: string;
    localizeOnlyDocumentPath?: string;
    inheritedSiblingScope?: SiblingScope;
    path: string;
    referencePath?: string;
    scanningDocument?: boolean;
    schemaDocumentLoaded?: boolean;
    schemaRoot?: boolean;
    value: unknown;
    viaRef?: boolean;
    waitForDocumentScan?: boolean;
  };
  type LocalizationTarget = {
    document: ConfigDocument;
    documentPath?: string;
    loadedDocument?: boolean;
    rewrite?: boolean;
    referencePath?: string;
    schemaDocumentLoaded?: boolean;
    target: unknown;
  };
  type LocalizationSchedule = {
    documents: WeakSet<object>;
    targets: WeakMap<object, Set<string>>;
  };
  const mainDocument: ConfigDocument = {
    basePath: schemaFileBasePath,
    dynamicIdScope: usesDynamicIdScope(root),
    root,
  };

  const getScopedDocument = (document: ConfigDocument, value: MutableContainer): ConfigDocument => {
    if (!document.dynamicIdScope) {
      return document;
    }
    const directoryUrl = pathToFileURL(resolve(document.basePath, '.')).href;
    const baseUrl =
      document.baseUrl ??
      document.cacheKey ??
      (directoryUrl.endsWith('/') ? directoryUrl : `${directoryUrl}/`);
    return {
      ...document,
      baseUrl: getSchemaBasePath(baseUrl, value),
    };
  };

  const getDocumentPathScope = (
    document: ConfigDocument,
    documentPath: string | undefined,
  ): ConfigDocument => {
    if (!document.dynamicIdScope || !documentPath) {
      return document;
    }
    let scopedDocument = document.cacheKey ? { ...document, baseUrl: document.cacheKey } : document;
    let current = document.root;
    if (isMutableContainer(current)) {
      scopedDocument = getScopedDocument(scopedDocument, current);
    }
    for (const token of tokenizePath(documentPath).map((value) =>
      value.replace(/~1/g, '/').replace(/~0/g, '~'),
    )) {
      if (!isMutableContainer(current) || !hasOwn(current, token)) {
        break;
      }
      current = getValue(current, token);
      if (isMutableContainer(current)) {
        scopedDocument = getScopedDocument(scopedDocument, current);
      }
    }
    return scopedDocument;
  };

  const getTargetScopeKey = (resolved: LocalizationTarget): string => {
    const scopedDocument = getDocumentPathScope(resolved.document, resolved.documentPath);
    return [
      scopedDocument.cacheKey ?? 'main',
      scopedDocument.baseUrl ?? '',
      resolved.documentPath ?? '#',
      resolved.referencePath ?? '',
    ].join('\0');
  };

  const getSiblingScopeKey = (scope: SiblingScope): string =>
    [
      scope.document.cacheKey ?? 'main',
      scope.document.baseUrl ?? '',
      scope.document.basePath,
      scope.referencePath ?? '',
    ].join('\0');

  const getScopedTarget = (target: unknown, scope: SiblingScope): unknown => {
    const scopeKey = getSiblingScopeKey(scope);
    const cloneValue = (value: unknown): unknown => {
      if (!isMutableContainer(value)) {
        return value;
      }
      const views = scopedTargets.get(value) ?? new Map<string, unknown>();
      if (views.has(scopeKey)) {
        return views.get(scopeKey);
      }
      scopedTargets.set(value, views);

      const existingReplacement = replacements.get(value);
      if (existingReplacement) {
        const placeholder = {};
        replacements.set(placeholder, existingReplacement);
        rawSources.set(placeholder, rawSources.get(value) ?? value);
        views.set(scopeKey, placeholder);
        scopedTargets.set(placeholder, new Map([[scopeKey, placeholder]]));
        return placeholder;
      }
      if (!isJsonContainer(value)) {
        const placeholder = {};
        replacements.set(placeholder, { traverse: false, value });
        rawSources.set(placeholder, rawSources.get(value) ?? value);
        views.set(scopeKey, placeholder);
        scopedTargets.set(placeholder, new Map([[scopeKey, placeholder]]));
        return placeholder;
      }
      if (cloneBudget.seen.has(value) && ++cloneBudget.aliasClones > MAX_ALIAS_CLONES) {
        throw new Error(
          `Config alias expansion exceeds the ${MAX_ALIAS_CLONES.toLocaleString()} object safety limit`,
        );
      }
      cloneBudget.seen.add(value);
      const clone: MutableContainer = Array.isArray(value)
        ? new Array(value.length)
        : Object.create(Object.getPrototypeOf(value));
      views.set(scopeKey, clone);
      rawSources.set(clone, rawSources.get(value) ?? value);
      scopedTargets.set(clone, new Map([[scopeKey, clone]]));
      for (const key of Object.keys(value)) {
        setValue(
          clone,
          key,
          getScopedCloneChild(value, key, scopeKey, scopedTargets, originalRefs, cloneValue),
        );
      }
      return clone;
    };
    return cloneValue(target);
  };

  const resolveRefTarget = async (
    value: MutableContainer,
    ref: string,
    document: ConfigDocument,
    path: string,
    parentPath: string,
    schemaBoundary: boolean,
    followAll: boolean,
  ): Promise<LocalizationTarget | undefined> => {
    const localized = localizedRefs.get(value);
    if (localized) {
      return localized;
    }

    const relevant = followAll || schemaBoundary || canFollowSchemaRef(path, source);
    const documentRef = resolveDocumentRef(ref, document);
    if (documentRef && relevant && (!schemaBoundary || /^file:\/\//i.test(ref))) {
      if (schemaBoundary && hasNamedFragment(ref, documentRef)) {
        return undefined;
      }
      const loaded = await loadTarget(documentRef, document, schemaBoundary, parentPath);
      return {
        ...loaded,
        loadedDocument: true,
        referencePath: documentRef,
        rewrite: true,
      };
    }
    if (document.cacheKey && ref.startsWith('#') && relevant) {
      const selected =
        ref === '#'
          ? { documentPath: '#', value: document.root }
          : selectMountedDocumentTarget(document.root, ref, document.cacheKey, parentPath);
      return {
        document,
        documentPath: selected.documentPath,
        referencePath: `${document.cacheKey}${normalizeRefFragment(ref, document.cacheKey)}`,
        rewrite: true,
        target: selected.value,
      };
    }
    if (
      !document.cacheKey &&
      ref.startsWith('#/') &&
      (schemaBoundary || (!followAll && canFollowSchemaRef(path, source)))
    ) {
      const target = resolveLocalPointer(root, ref)?.value;
      return target === undefined ? undefined : { document, target };
    }
    return undefined;
  };

  const addChildren = (
    stack: LocalizationItem[],
    item: LocalizationItem,
    value: MutableContainer,
    followAll: boolean,
    siblingScope?: { document: ConfigDocument; referencePath?: string },
  ): void => {
    const childAncestors = new Set(item.ancestors);
    childAncestors.add(value);
    const childDocument = getScopedDocument(siblingScope?.document ?? item.document, value);
    const referencePath = siblingScope?.referencePath ?? item.referencePath;
    const children = Object.entries(value);
    for (let index = children.length - 1; index >= 0; index--) {
      const [childKey, child] = children[index];
      if (value === root && childKey === mountKey) {
        continue;
      }
      const path = joinPointer(item.path, childKey);
      if (
        !followAll &&
        !canFollowSchemaRef(path, source) &&
        !isStandaloneSchemaPath(path, source) &&
        !isAssertionSchemaPath(path, value, source)
      ) {
        continue;
      }
      const documentPath = item.documentPath ? joinPointer(item.documentPath, childKey) : undefined;
      stack.push({
        ancestors: childAncestors,
        document: childDocument,
        documentPath,
        localizeOnlyDocumentPath: item.localizeOnlyDocumentPath,
        key: childKey,
        parent: value,
        path,
        referencePath: appendReferencePath(referencePath, childKey),
        scanningDocument: item.scanningDocument,
        value: child,
      });
    }
  };

  const getVisitKey = (item: LocalizationItem, followAll: boolean): string => {
    if (!followAll) {
      return [
        item.document.cacheKey ?? 'main',
        item.document.baseUrl ?? '',
        item.document.basePath,
        item.inheritedSiblingScope
          ? getSiblingScopeKey(item.inheritedSiblingScope)
          : 'no-sibling-scope',
        item.path,
      ].join('\0');
    }
    const insideSelectedPath = Boolean(
      item.documentPath &&
        item.localizeOnlyDocumentPath &&
        (item.documentPath === item.localizeOnlyDocumentPath ||
          item.documentPath.startsWith(`${item.localizeOnlyDocumentPath}/`)),
    );
    return [
      item.document.cacheKey ?? 'main',
      item.document.baseUrl ?? '',
      item.document.basePath,
      item.inheritedSiblingScope
        ? getSiblingScopeKey(item.inheritedSiblingScope)
        : 'no-sibling-scope',
      item.schemaDocumentLoaded ? 'schema-document' : 'config-document',
      item.scanningDocument ? 'scanning-document' : 'selected-value',
      insideSelectedPath ? 'inside-selected-path' : 'outside-selected-path',
      item.value === root ? 'root' : 'nested',
    ].join('\0');
  };

  const visitItem = (
    item: LocalizationItem,
    visited: WeakMap<object, Set<string>>,
    followAll: boolean,
    maskedRoots: WeakSet<object> | undefined,
    budget: { refPaths: number },
  ): item is LocalizationItem & { value: MutableContainer } => {
    if (
      !isMutableContainer(item.value) ||
      item.ancestors?.has(item.value) ||
      (maskedRoots?.has(item.value) ?? false) ||
      (indexedRefObjects.has(item.value) && !refReachable.has(item.value))
    ) {
      return false;
    }
    if (item.viaRef && ++budget.refPaths > MAX_REF_PROVENANCE_PATHS) {
      throw new Error(
        `Config external ref discovery exceeds the ${MAX_REF_PROVENANCE_PATHS.toLocaleString()} path safety limit`,
      );
    }

    const visitedPaths = visited.get(item.value) ?? new Set<string>();
    const visitKey = getVisitKey(item, followAll);
    if (visitedPaths.has(visitKey)) {
      return false;
    }
    visitedPaths.add(visitKey);
    visited.set(item.value, visitedPaths);
    return true;
  };

  const isSchemaBoundary = (item: LocalizationItem, followAll: boolean): boolean =>
    !followAll &&
    Boolean(
      item.schemaRoot ||
        (item.key !== undefined &&
          item.parent &&
          (isStandaloneSchemaPath(item.path, source) ||
            isAssertionSchemaPath(item.path, item.parent, source))),
    );

  const getSiblingScope = async (
    resolved: LocalizationTarget,
    item: LocalizationItem,
    schemaBoundary: boolean,
    followAll: boolean,
  ): Promise<SiblingScope | undefined> => {
    if (item.inheritedSiblingScope) {
      return item.inheritedSiblingScope;
    }
    if (getLocalizationPureRef(item.value)) {
      return undefined;
    }
    // RefParser keeps extended-ref siblings in their containing loaded document. The main input has
    // no document URL, so its siblings inherit the last document reached through pure ref hops.
    if (item.document.cacheKey) {
      return { document: item.document, referencePath: item.document.cacheKey };
    }
    if (!resolved.loadedDocument) {
      return undefined;
    }
    const tracePureScope = async () => {
      let document = getDocumentPathScope(resolved.document, resolved.documentPath);
      let referencePath = resolved.referencePath;
      let target = resolved.target;
      let terminal: LocalizationTarget = resolved;
      let traversed = false;
      let canFlatten = true;
      let sameDocument = true;
      const cycleCacheKey = resolved.document.cacheKey;
      const visited = new WeakSet<object>();
      for (let depth = 0; depth < MAX_REF_PROVENANCE_PATHS; depth++) {
        if (!isMutableObject(target)) {
          break;
        }
        if (visited.has(target)) {
          canFlatten = false;
          if (sameDocument && isMutableContainer(resolved.target)) {
            cyclicTargets.add(resolved.target);
          }
          break;
        }
        visited.add(target);
        const ref = getLocalizationPureRef(target);
        if (!ref) {
          break;
        }
        const next = await resolveRefTarget(
          target,
          ref,
          document,
          item.path,
          referencePath ?? item.referencePath ?? resolve(item.path),
          schemaBoundary,
          followAll,
        );
        if (!next) {
          canFlatten = false;
          break;
        }
        traversed = true;
        terminal = next;
        sameDocument &&= next.document.cacheKey === cycleCacheKey;
        document = getDocumentPathScope(next.document, next.documentPath);
        referencePath = next.referencePath;
        target = next.target;
      }
      if (traversed && getLocalizationPureRef(target)) {
        canFlatten = false;
      }
      return { canFlatten, document, referencePath, target, terminal, traversed };
    };

    const resolveScope = async (): Promise<SiblingScope> => {
      const { canFlatten, document, terminal, traversed } = await tracePureScope();
      return {
        document,
        referencePath: document.cacheKey,
        terminal:
          traversed && canFlatten
            ? {
                document: terminal.document,
                documentPath: terminal.documentPath,
                referencePath: terminal.referencePath,
                target: terminal.target,
              }
            : undefined,
      };
    };

    if (!followAll || schemaBoundary || !isMutableContainer(resolved.target)) {
      return resolveScope();
    }
    const cacheKey = getTargetScopeKey(resolved);
    const cachedScopes = siblingScopeCache.get(resolved.target) ?? new Map();
    let scope = cachedScopes.get(cacheKey);
    if (!scope) {
      scope = resolveScope();
      cachedScopes.set(cacheKey, scope);
      siblingScopeCache.set(resolved.target, cachedScopes);
    }
    try {
      return await scope;
    } catch (error) {
      if (cachedScopes.get(cacheKey) === scope) {
        cachedScopes.delete(cacheKey);
      }
      throw error;
    }
  };

  const shouldScheduleTarget = (
    resolved: LocalizationTarget,
    inheritedSiblingScope: SiblingScope | undefined,
    schemaBoundary: boolean,
    followAll: boolean,
    schedule: LocalizationSchedule,
  ): boolean => {
    if (!followAll || schemaBoundary || !isMutableContainer(resolved.target)) {
      return true;
    }
    const scheduleKey = [
      getTargetScopeKey(resolved),
      inheritedSiblingScope?.document.cacheKey ?? 'main',
      inheritedSiblingScope?.document.baseUrl ?? '',
      inheritedSiblingScope?.document.basePath ?? '',
      inheritedSiblingScope?.referencePath ?? '',
    ].join('\0');
    const scheduledScopes = schedule.targets.get(resolved.target) ?? new Set<string>();
    if (scheduledScopes.has(scheduleKey)) {
      return false;
    }
    scheduledScopes.add(scheduleKey);
    schedule.targets.set(resolved.target, scheduledScopes);
    return true;
  };

  const recordExternalConfigConsumer = (
    resolved: LocalizationTarget,
    consumer: MutableContainer,
    schemaBoundary: boolean,
  ): void => {
    if (
      schemaBoundary ||
      !resolved.loadedDocument ||
      !resolved.referencePath ||
      Array.isArray(consumer)
    ) {
      return;
    }
    if (!externalConfigConsumers.has(consumer)) {
      externalConfigConsumers.set(consumer, {
        cacheKey: resolved.document.cacheKey,
        referencePath: resolved.referencePath,
        target: resolved.target,
      });
    }
  };

  const getResolvedViews = (
    resolved: LocalizationTarget,
    siblingScope: SiblingScope | undefined,
    inheritedSiblingScope: SiblingScope | undefined,
  ): { consumer: LocalizationTarget; traversal: LocalizationTarget } => {
    const consumer = siblingScope?.terminal ? { ...resolved, ...siblingScope.terminal } : resolved;
    if (!inheritedSiblingScope) {
      return { consumer, traversal: resolved };
    }
    const traversal = isMutableContainer(resolved.target)
      ? { ...resolved, target: getScopedTarget(resolved.target, inheritedSiblingScope) }
      : resolved;
    if (consumer.target === resolved.target) {
      return { consumer: traversal, traversal };
    }
    return {
      consumer: isMutableContainer(consumer.target)
        ? {
            ...consumer,
            target: getScopedTarget(consumer.target, inheritedSiblingScope),
          }
        : consumer,
      traversal,
    };
  };

  const rewriteResolvedRef = (
    item: LocalizationItem & { value: MutableContainer },
    resolved: LocalizationTarget,
    consumer: LocalizationTarget,
    schemaBoundary: boolean,
  ): void => {
    if (!resolved.rewrite) {
      return;
    }
    rewriteRef(
      item.value as Record<string, unknown>,
      consumer.target,
      consumer.document,
      consumer.documentPath,
      Boolean(resolved.loadedDocument),
      consumer.referencePath,
      schemaBoundary && Boolean(resolved.loadedDocument),
      item.document.cacheKey,
    );
  };

  const enqueueResolvedTarget = (
    stack: LocalizationItem[],
    item: LocalizationItem,
    resolved: LocalizationTarget,
    inheritedSiblingScope: SiblingScope | undefined,
    schemaBoundary: boolean,
    followAll: boolean,
    schedule: LocalizationSchedule,
  ): void => {
    if (
      !shouldScheduleTarget(resolved, inheritedSiblingScope, schemaBoundary, followAll, schedule)
    ) {
      return;
    }
    stack.push({
      ancestors: item.ancestors,
      document: getDocumentPathScope(resolved.document, resolved.documentPath),
      documentPath: resolved.documentPath,
      inheritedSiblingScope,
      waitForDocumentScan: Boolean(
        !schemaBoundary && followAll && item.scanningDocument && !resolved.loadedDocument,
      ),
      path: item.path,
      referencePath: resolved.referencePath,
      schemaDocumentLoaded:
        resolved.schemaDocumentLoaded || (schemaBoundary && resolved.loadedDocument),
      schemaRoot: schemaBoundary,
      value: resolved.target,
      viaRef: true,
    });
  };

  const enqueueDocumentScan = (
    stack: LocalizationItem[],
    item: LocalizationItem,
    resolved: LocalizationTarget,
    schemaBoundary: boolean,
    followAll: boolean,
    schedule: LocalizationSchedule,
  ): void => {
    const documentRoot = resolved.document.root;
    if (
      !resolved.loadedDocument ||
      schemaBoundary ||
      !followAll ||
      !isMutableContainer(documentRoot) ||
      schedule.documents.has(documentRoot)
    ) {
      return;
    }
    schedule.documents.add(documentRoot);
    const selectedDocumentPath = resolved.documentPath ?? '#';
    stack.push({
      ancestors: item.ancestors,
      document: resolved.document,
      documentPath: '#',
      localizeOnlyDocumentPath: selectedDocumentPath === '#' ? undefined : selectedDocumentPath,
      path: item.path,
      referencePath: resolved.document.cacheKey,
      scanningDocument: true,
      value: documentRoot,
      viaRef: true,
    });
  };

  const followItemRef = async (
    stack: LocalizationItem[],
    item: LocalizationItem & { value: MutableContainer },
    schemaBoundary: boolean,
    followAll: boolean,
    schedule: LocalizationSchedule,
  ): Promise<{ document: ConfigDocument; referencePath?: string } | undefined> => {
    if (item.schemaDocumentLoaded) {
      return undefined;
    }
    const ref =
      !Array.isArray(item.value) && typeof item.value.$ref === 'string'
        ? item.value.$ref
        : undefined;
    if (!ref) {
      return undefined;
    }
    if (
      item.documentPath &&
      item.localizeOnlyDocumentPath &&
      (item.documentPath === item.localizeOnlyDocumentPath ||
        item.documentPath.startsWith(`${item.localizeOnlyDocumentPath}/`))
    ) {
      return item.inheritedSiblingScope;
    }
    const resolved = await resolveRefTarget(
      item.value,
      ref,
      getScopedDocument(item.document, item.value),
      item.path,
      item.referencePath ?? resolve(item.path),
      schemaBoundary,
      followAll,
    );
    if (!resolved) {
      return undefined;
    }
    const siblingScope = await getSiblingScope(resolved, item, schemaBoundary, followAll);
    const inheritedSiblingScope = siblingScope
      ? { document: siblingScope.document, referencePath: siblingScope.referencePath }
      : item.inheritedSiblingScope;
    const views = getResolvedViews(resolved, siblingScope, inheritedSiblingScope);
    recordExternalConfigConsumer(
      { ...resolved, target: views.traversal.target },
      item.value,
      schemaBoundary,
    );
    rewriteResolvedRef(item, resolved, views.consumer, schemaBoundary);
    enqueueResolvedTarget(
      stack,
      item,
      views.traversal,
      inheritedSiblingScope,
      schemaBoundary,
      followAll,
      schedule,
    );
    enqueueDocumentScan(stack, item, resolved, schemaBoundary, followAll, schedule);
    return siblingScope;
  };

  const drainLocalizationStack = async (
    stack: LocalizationItem[],
    waiting: LocalizationItem[],
    visited: WeakMap<object, Set<string>>,
    followAll: boolean,
    schedule: LocalizationSchedule,
    maskedRoots?: WeakSet<object>,
  ): Promise<void> => {
    while (stack.length > 0) {
      const item = stack.pop()!;
      if (item.waitForDocumentScan) {
        waiting.push({ ...item, waitForDocumentScan: false });
        continue;
      }
      if (!visitItem(item, visited, followAll, maskedRoots, traversalBudget)) {
        continue;
      }
      const schemaBoundary = isSchemaBoundary(item, followAll);
      if (schemaBoundary && !getLocalizationPureRef(item.value)) {
        continue;
      }
      const siblingScope =
        (await followItemRef(stack, item, schemaBoundary, followAll, schedule)) ??
        item.inheritedSiblingScope;
      if (!schemaBoundary && !item.schemaDocumentLoaded) {
        addChildren(stack, item, item.value, followAll, siblingScope);
      }
    }
  };

  const run = async (
    initial: LocalizationItem[],
    followAll: boolean,
    maskedRoots?: WeakSet<object>,
  ): Promise<void> => {
    const stack = initial;
    const visited = new WeakMap<object, Set<string>>();
    const schedule: LocalizationSchedule = {
      documents: new WeakSet<object>(),
      targets: new WeakMap<object, Set<string>>(),
    };
    let waiting: LocalizationItem[] = [];
    while (stack.length > 0 || waiting.length > 0) {
      await drainLocalizationStack(stack, waiting, visited, followAll, schedule, maskedRoots);
      if (waiting.length > 0) {
        for (const item of waiting.reverse()) {
          stack.push(item);
        }
        waiting = [];
      }
    }
  };

  const getConfigCycleEdges = (value: MutableContainer): MutableContainer[] => {
    const edges: MutableContainer[] = [];
    const ref = localizedRefs.get(value);
    if (ref?.sourceCacheKey && ref.targetCacheKey && isMutableContainer(ref.target)) {
      edges.push(ref.target);
    }
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor && isMutableContainer(descriptor.value)) {
        edges.push(descriptor.value);
      }
    }
    return edges;
  };

  type CycleFrame = {
    edges?: MutableContainer[];
    nextEdge: number;
    value: MutableContainer;
  };
  const cycleReachabilityMemo = new WeakMap<object, boolean>();
  const getKnownCycleReachability = (value: object): boolean | undefined =>
    cyclicTargets.has(value) ? true : cycleReachabilityMemo.get(value);
  const markCyclePathReachable = (stack: CycleFrame[], edge?: object): true => {
    if (edge) {
      cycleReachabilityMemo.set(edge, true);
    }
    for (const frame of stack) {
      cycleReachabilityMemo.set(frame.value, true);
    }
    return true;
  };
  const countCycleVisit = (visited: number): number => {
    const next = visited + 1;
    if (next > MAX_REF_EXPANSION_PROPERTIES) {
      throw new Error(
        `Config cycle discovery exceeds the ${MAX_REF_EXPANSION_PROPERTIES.toLocaleString()} property safety limit`,
      );
    }
    return next;
  };
  const reachesConfigCycle = (target: unknown): boolean => {
    if (!isMutableContainer(target)) {
      return false;
    }
    const known = getKnownCycleReachability(target);
    if (known !== undefined) {
      return known;
    }
    const active = new WeakSet<object>();
    const stack: CycleFrame[] = [{ nextEdge: 0, value: target }];
    let visited = 0;
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame.edges) {
        visited = countCycleVisit(visited);
        if (getKnownCycleReachability(frame.value) === true) {
          return markCyclePathReachable(stack);
        }
        frame.edges = getConfigCycleEdges(frame.value);
        active.add(frame.value);
      }
      if (frame.nextEdge >= frame.edges.length) {
        active.delete(frame.value);
        cycleReachabilityMemo.set(frame.value, false);
        stack.pop();
        continue;
      }

      const edge = frame.edges[frame.nextEdge++];
      const edgeMemo = getKnownCycleReachability(edge);
      if (edgeMemo === true || active.has(edge)) {
        return markCyclePathReachable(stack, edge);
      }
      if (edgeMemo === false) {
        continue;
      }
      stack.push({ nextEdge: 0, value: edge });
    }
    return false;
  };

  const restoreVisibleRootRefs = (): void => {
    const seen = new WeakSet<object>();
    const stack = [root];
    while (stack.length > 0) {
      const value = stack.pop()!;
      if (seen.has(value)) {
        continue;
      }
      seen.add(value);
      const originalRef = originalRefs.get(value);
      if (originalRef !== undefined && !Array.isArray(value)) {
        setValue(value, '$ref', originalRef);
      }
      for (const key of Object.keys(value)) {
        if (value === root && key === mountKey) {
          continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor && 'value' in descriptor && isMutableContainer(descriptor.value)) {
          stack.push(descriptor.value);
        }
      }
    }
  };

  const setExternalConsumerRefs = (
    consumers: Iterable<readonly [MutableContainer, string]>,
  ): void => {
    for (const [consumer, referencePath] of consumers) {
      setValue(consumer, '$ref', referencePath);
    }
  };

  const prepareParserReplay = (): boolean => {
    const replayConsumers: Array<[MutableContainer, string]> = [];
    for (const [consumer, { cacheKey, referencePath, target }] of externalConfigConsumers) {
      if (cacheKey && (rawReplayCandidates.has(cacheKey) || reachesConfigCycle(target))) {
        rawReplayDocuments.add(cacheKey);
        replayConsumers.push([consumer, referencePath]);
      }
    }
    const replayedRoot = replayConsumers.some(([consumer]) => consumer === root);
    if (replayedRoot) {
      restoreVisibleRootRefs();
      setExternalConsumerRefs(
        [...externalConfigConsumers].map(([consumer, { referencePath }]) => [
          consumer,
          referencePath,
        ]),
      );
    } else {
      setExternalConsumerRefs(replayConsumers);
    }
    return replayedRoot;
  };

  await run([{ document: mainDocument, path: '#', value: root }], false);

  return {
    finish: async (maskedRoots: WeakSet<object>) => {
      await run([{ document: mainDocument, path: '#', value: root }], true, maskedRoots);
    },
    getMount: () => (targets.length > 0 ? { key: mountKey, value: targets } : undefined),
    getParserDocument: (cacheKey: string) => {
      if (parserDocuments.has(cacheKey)) {
        return parserDocuments.get(cacheKey);
      }
      const document = mountedDocuments.get(`${cacheKey}\0config`);
      if (!document) {
        return undefined;
      }
      const source = document.parserRoot ?? document.root;
      const rawReplay = rawReplayDocuments.has(cacheKey);
      const parserDocument = rawReplay
        ? hasParserReplayMask(document.root, replacements)
          ? cloneParserReplayDocument(source, document.root, replacements, rawSources)
          : structuredClone(source)
        : cloneConfigValue(document.root, replacements, {
            aliasClones: 0,
            seen: new WeakSet<object>(),
          });
      if (!rawReplay && isMutableContainer(parserDocument)) {
        Object.defineProperty(parserDocument, mountKey, {
          configurable: true,
          enumerable: false,
          value: targets,
          writable: true,
        });
      }
      absolutizeRelativeFileRefs(parserDocument, document.basePath);
      parserDocuments.set(cacheKey, parserDocument);
      return parserDocument;
    },
    getRefProvenance: (value: object) => localizedRefs.get(value),
    getRevision: () => revision,
    isReplayDocument: (url: string) => {
      const fragmentIndex = url.indexOf('#');
      const documentUrl = fragmentIndex === -1 ? url : url.slice(0, fragmentIndex);
      if (rawReplayDocuments.has(documentUrl)) {
        return true;
      }
      try {
        const parsed = new URL(url);
        parsed.hash = '';
        return rawReplayDocuments.has(parsed.toString());
      } catch {
        return false;
      }
    },
    prepareParserReplay,
  };
}

function removeExternalRefMount(
  root: unknown,
  mount: { key: string; value: unknown[] } | undefined,
): void {
  if (!mount) {
    return;
  }
  const visited = new WeakSet<object>();
  const stack = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (!isMutableContainer(value) || visited.has(value)) {
      continue;
    }
    visited.add(value);
    const mountDescriptor = Object.getOwnPropertyDescriptor(value, mount.key);
    if (mountDescriptor && 'value' in mountDescriptor && mountDescriptor.value === mount.value) {
      Reflect.deleteProperty(value, mount.key);
    }
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor) {
        stack.push(descriptor.value);
      }
    }
  }
}

function resolveExternalMountTarget(
  mount: { key: string; value: unknown[] },
  mountPath: string,
  ref: string,
): unknown {
  const pointer = ref === mountPath ? '#' : `#${ref.slice(mountPath.length)}`;
  return resolveLocalPointer(mount.value, pointer)?.value;
}

function restoreSurvivingExternalRefs(
  root: unknown,
  mount: { key: string; value: unknown[] } | undefined,
  originalRefs: WeakMap<object, string>,
  getRefProvenance: (value: object) => ExternalRefProvenance | undefined,
): void {
  if (!mount || !isMutableContainer(root)) {
    return;
  }
  const mountPath = joinPointer('#', mount.key);
  const visiblePaths = new WeakMap<object, string>();
  const visibleValues: MutableContainer[] = [];
  const queue: Array<{ path: string; value: unknown }> = [{ path: '#', value: root }];
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index];
    if (!isMutableContainer(item.value) || visiblePaths.has(item.value)) {
      continue;
    }
    visiblePaths.set(item.value, item.path);
    visibleValues.push(item.value);
    for (const key of Object.keys(item.value)) {
      const descriptor = Object.getOwnPropertyDescriptor(item.value, key);
      if (
        !descriptor ||
        !('value' in descriptor) ||
        (key === mount.key && descriptor.value === mount.value)
      ) {
        continue;
      }
      queue.push({ path: joinPointer(item.path, key), value: descriptor.value });
    }
  }

  for (const value of visibleValues) {
    const originalRef = originalRefs.get(value);
    if (originalRef === undefined) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, '$ref');
    const ref = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof ref !== 'string' || (ref !== mountPath && !ref.startsWith(`${mountPath}/`))) {
      continue;
    }
    const target = resolveExternalMountTarget(mount, mountPath, ref);
    const visibleTargetPath = isMutableContainer(target) ? visiblePaths.get(target) : undefined;
    const provenance = getRefProvenance(value);
    const sameDocumentCycle =
      provenance?.sourceCacheKey !== undefined &&
      provenance.sourceCacheKey === provenance.targetCacheKey;
    setValue(
      value,
      '$ref',
      sameDocumentCycle && visibleTargetPath && visibleTargetPath !== '#'
        ? visibleTargetPath
        : originalRef,
    );
  }
}

async function dereferenceLocalizedRoot<T extends object>(
  root: T,
  mount: { key: string; value: unknown[] } | undefined,
  documents: ReferencedDocumentCache,
  getParserDocument: (cacheKey: string) => unknown,
  isReplayDocument: (url: string) => boolean,
  replayedRoot: boolean,
): Promise<T> {
  type ResolverReadResult = string | Buffer | object | Promise<string | Buffer | object>;
  const getCachedDocument = (url: string): Promise<ReferencedDocument> | undefined => {
    const fragmentIndex = url.indexOf('#');
    const documentUrl = fragmentIndex === -1 ? url : url.slice(0, fragmentIndex);
    const direct = documents.get(documentUrl);
    if (direct) {
      return direct;
    }
    try {
      const normalized = documents.get(normalizeUrlPreservingTrailingWhitespace(documentUrl));
      if (normalized) {
        return normalized;
      }
      return undefined;
    } catch {
      return undefined;
    }
  };
  const defaultOptions = getJsonSchemaRefParserDefaultOptions();
  const withCachedDocuments = (
    fallback: (file: { url: string }) => ResolverReadResult,
  ): ((file: { url: string }) => ResolverReadResult) => {
    return (file) => {
      const document = getCachedDocument(file.url);
      if (!document) {
        if (isReplayDocument(file.url)) {
          throw new Error(`Replayed config document was not preloaded: ${file.url}`);
        }
        return fallback(file);
      }
      return document.then((loaded) => {
        const parserDocument = getParserDocument(loaded.cacheKey);
        if (parserDocument === undefined) {
          throw new Error(`Referenced config document is not finalized: ${file.url}`);
        }
        return parserDocument as object;
      });
    };
  };
  const fileResolver = defaultOptions.resolve.file;
  const httpResolver = defaultOptions.resolve.http;
  if (
    !fileResolver ||
    !httpResolver ||
    typeof fileResolver !== 'object' ||
    typeof httpResolver !== 'object' ||
    typeof fileResolver.read !== 'function' ||
    typeof httpResolver.read !== 'function'
  ) {
    throw new Error('JSON Schema RefParser default resolvers are unavailable');
  }
  const options = {
    resolve: {
      file: {
        read: withCachedDocuments(
          fileResolver.read.bind(fileResolver) as (file: { url: string }) => ResolverReadResult,
        ),
      },
      http: {
        read: withCachedDocuments(
          httpResolver.read.bind(httpResolver) as (file: { url: string }) => ResolverReadResult,
        ),
      },
    },
  };
  const rootRef = Array.isArray(root) ? undefined : (root as Record<string, unknown>).$ref;
  if (mount && typeof rootRef === 'string') {
    const mountDescriptor = Object.getOwnPropertyDescriptor(root, mount.key);
    if (mountDescriptor && 'value' in mountDescriptor && mountDescriptor.value === mount.value) {
      if (rootRef.startsWith(`${joinPointer('#', mount.key)}/`)) {
        Reflect.deleteProperty(root, mount.key);
        const wrapper: Record<string, unknown> = { value: root };
        setValue(wrapper, mount.key, mount.value);
        return ((await $RefParser.dereference(wrapper, options)) as { value: T }).value;
      }
      if (replayedRoot) {
        Reflect.deleteProperty(root, mount.key);
      }
    }
  }
  return (await $RefParser.dereference(root, options)) as T;
}

function absolutizeRelativeFileRefs(root: unknown, basePath: string): void {
  const visited = new WeakSet<object>();
  const stack = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (!isMutableContainer(value) || visited.has(value)) {
      continue;
    }
    visited.add(value);
    if (!Array.isArray(value) && typeof value.$ref === 'string' && /^file:\/\//i.test(value.$ref)) {
      const fragmentIndex = value.$ref.indexOf('#');
      const documentRef = fragmentIndex === -1 ? value.$ref : value.$ref.slice(0, fragmentIndex);
      const fragment = fragmentIndex === -1 ? '' : value.$ref.slice(fragmentIndex);
      const promptfooPath = documentRef.slice('file://'.length);
      const relativePath = resolve(basePath, promptfooPath);
      const ambiguousUnc =
        process.platform === 'win32' && promptfooPath.includes('/') && !existsSync(relativePath);
      if (
        !ambiguousUnc &&
        !promptfooPath.startsWith('/') &&
        !/^localhost\//i.test(promptfooPath) &&
        !/^[A-Za-z]:[\\/]/.test(promptfooPath)
      ) {
        setValue(value, '$ref', `${pathToFileURL(relativePath).href}${fragment}`);
      }
    }
    for (const child of Object.values(value)) {
      stack.push(child);
    }
  }
}

function createPathTrieNode(): PathTrieNode {
  return { children: new Map<string, PathTrieNode>() };
}

function cloneDetachedValues(
  locations: ValueLocation[],
  replacements: Map<object, PlaceholderReplacement>,
  preservedAncestors: WeakSet<object>,
  detachedPaths: PathTrieNode,
  ordinaryRefEdges: OrdinaryRefEdges,
  ordinaryRefPaths: OrdinaryRefPaths,
): Map<object, unknown> {
  const clones = new Map<object, unknown>();
  const memo = new WeakMap<object, unknown>();
  const filled = new WeakSet<object>();

  const createContainer = (value: object): MutableContainer =>
    Array.isArray(value)
      ? new Array(value.length)
      : (Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>);

  for (const { value } of locations) {
    if (isMutableContainer(value) && isJsonContainer(value) && !clones.has(value)) {
      const clone = createContainer(value);
      clones.set(value, clone);
      memo.set(value, clone);
    }
  }

  const cloneValue = (value: unknown, path: string): unknown => {
    if (!isMutableContainer(value)) {
      return value;
    }
    const memoized = memo.get(value);
    if (memoized !== undefined) {
      fillContainer(value, memoized as MutableContainer, path);
      return memoized;
    }
    if (preservedAncestors.has(value)) {
      return value;
    }
    const existingReplacement = replacements.get(value);
    if (existingReplacement) {
      const placeholder = {};
      replacements.set(placeholder, existingReplacement);
      return placeholder;
    }
    if (!isJsonContainer(value)) {
      const placeholder = {};
      replacements.set(placeholder, { traverse: false, value });
      return placeholder;
    }
    const clone = createContainer(value);
    memo.set(value, clone);
    fillContainer(value, clone, path);
    return clone;
  };

  function fillContainer(value: object, clone: MutableContainer, path: string): void {
    if (filled.has(value)) {
      return;
    }
    filled.add(value);
    for (const key of Object.keys(value)) {
      const child = (value as Record<string, unknown>)[key];
      const childPath = joinPointer(path, key);
      const refEdges = ordinaryRefEdges.get(value);
      const hasIdentityRef = refEdges?.has(key) ?? false;
      const hasPathRef = ordinaryRefPaths.has(childPath);
      const refTarget = hasIdentityRef ? refEdges?.get(key) : ordinaryRefPaths.get(childPath);
      const preserveRefTarget =
        (hasIdentityRef || hasPathRef) &&
        (refTarget === null ||
          (refTarget !== undefined && !hasPathAncestor(detachedPaths, refTarget)));
      setValue(clone, key, preserveRefTarget ? child : cloneValue(child, childPath));
    }
  }

  for (const { path, value } of locations) {
    const clone = isMutableContainer(value) ? clones.get(value) : undefined;
    if (clone) {
      fillContainer(value as object, clone as MutableContainer, path);
    }
  }
  return clones;
}

function tokenizePath(path: string): string[] {
  return path === '#' ? [] : path.slice(2).split('/');
}

function addPathToTrie(root: PathTrieNode, path: string, sourceState?: number): void {
  let node = root;
  for (const token of tokenizePath(path)) {
    let child = node.children.get(token);
    if (!child) {
      child = createPathTrieNode();
      node.children.set(token, child);
    }
    node = child;
  }
  node.terminalPath ??= path;
  if (sourceState !== undefined) {
    (node.sourceStates ??= []).push(sourceState);
  }
}

function hasPathAncestor(root: PathTrieNode, path: string): boolean {
  let node = root;
  if (node.terminalPath !== undefined) {
    return true;
  }
  for (const token of tokenizePath(path)) {
    const child = node.children.get(token);
    if (!child) {
      return false;
    }
    node = child;
    if (node.terminalPath !== undefined) {
      return true;
    }
  }
  return false;
}

function pathOverlapsTrie(root: PathTrieNode, path: string): boolean {
  let node = root;
  if (node.terminalPath !== undefined) {
    return true;
  }
  for (const token of tokenizePath(path)) {
    const child = node.children.get(token);
    if (!child) {
      return false;
    }
    node = child;
    if (node.terminalPath !== undefined) {
      return true;
    }
  }
  return node.children.size > 0;
}

function findShallowestProperAncestor(root: PathTrieNode, path: string): string | undefined {
  const tokens = tokenizePath(path);
  let node = root;
  for (let index = 0; index < tokens.length - 1; index++) {
    const child = node.children.get(tokens[index]);
    if (!child) {
      return undefined;
    }
    node = child;
    if (node.terminalPath !== undefined) {
      return node.terminalPath;
    }
  }
  return undefined;
}

function createDisjointSet(size: number): DisjointSet {
  return {
    parents: Array.from({ length: size }, (_, index) => index),
    ranks: Array.from({ length: size }, () => 0),
  };
}

function findSet(set: DisjointSet, value: number): number {
  let root = value;
  while (set.parents[root] !== root) {
    root = set.parents[root];
  }
  while (set.parents[value] !== value) {
    const parent = set.parents[value];
    set.parents[value] = root;
    value = parent;
  }
  return root;
}

function unionSets(set: DisjointSet, left: number, right: number): void {
  let leftRoot = findSet(set, left);
  let rightRoot = findSet(set, right);
  if (leftRoot === rightRoot) {
    return;
  }
  if (set.ranks[leftRoot] < set.ranks[rightRoot]) {
    [leftRoot, rightRoot] = [rightRoot, leftRoot];
  }
  set.parents[rightRoot] = leftRoot;
  if (set.ranks[leftRoot] === set.ranks[rightRoot]) {
    set.ranks[leftRoot]++;
  }
}

function connectOverlappingSourceStates(root: PathTrieNode, set: DisjointSet): void {
  const stack: Array<{ ancestorState?: number; node: PathTrieNode }> = [{ node: root }];
  while (stack.length > 0) {
    const { ancestorState, node } = stack.pop()!;
    let nextAncestor = ancestorState;
    if (node.sourceStates?.length) {
      nextAncestor = node.sourceStates[0];
      if (ancestorState !== undefined) {
        unionSets(set, nextAncestor, ancestorState);
      }
      for (let index = 1; index < node.sourceStates.length; index++) {
        unionSets(set, nextAncestor, node.sourceStates[index]);
      }
    }
    for (const child of node.children.values()) {
      stack.push({ ancestorState: nextAncestor, node: child });
    }
  }
}

function collectOverlappingPathStates(root: PathTrieNode, path: string): Set<number> {
  const states = new Set<number>();
  const addStates = (node: PathTrieNode) => {
    for (const state of node.sourceStates ?? []) {
      states.add(state);
    }
  };

  let node = root;
  addStates(node);
  for (const token of tokenizePath(path)) {
    const child = node.children.get(token);
    if (!child) {
      return states;
    }
    node = child;
    addStates(node);
  }

  const stack = [...node.children.values()];
  while (stack.length > 0) {
    const child = stack.pop()!;
    addStates(child);
    for (const descendant of child.children.values()) {
      stack.push(descendant);
    }
  }
  return states;
}

function collectLocalRefTargets(values: unknown[]): Set<string> {
  const targets = new Set<string>();
  const visited = new WeakSet<object>();
  const stack = [...values];
  while (stack.length > 0) {
    const value = stack.pop();
    if (!isMutableContainer(value) || visited.has(value)) {
      continue;
    }
    visited.add(value);
    if (!Array.isArray(value) && typeof value.$ref === 'string') {
      const target = canonicalLocalRefPath(value.$ref);
      if (target && (target !== '#' || !getPureRef(value))) {
        targets.add(target);
      }
    }
    for (const child of Object.values(value)) {
      stack.push(child);
    }
  }
  return targets;
}

function indexSourceStates(
  states: SchemaState[],
  sourceSets: DisjointSet,
): {
  sourcesBySet: Map<number, unknown[]>;
  statePaths: PathTrieNode;
} {
  const statePaths = createPathTrieNode();
  const sourcesBySet = new Map<number, unknown[]>();
  for (let state = 0; state < states.length; state++) {
    addPathToTrie(statePaths, states[state].outputPath, state);
    for (const path of states[state].activationPaths) {
      addPathToTrie(statePaths, path, state);
    }
    const sourceSet = findSet(sourceSets, state);
    const values = sourcesBySet.get(sourceSet) ?? [];
    for (const source of states[state].sources) {
      addPathToTrie(statePaths, source.path, state);
      values.push(source.value);
    }
    sourcesBySet.set(sourceSet, values);
  }
  return { sourcesBySet, statePaths };
}

function activateSourceDependencies(
  ordinarySets: Set<number>,
  sourceSets: DisjointSet,
  sourcesBySet: ReadonlyMap<number, unknown[]>,
  statePaths: PathTrieNode,
  ordinaryTargets: PathTrieNode,
): void {
  const stateCache = new Map<string, Set<number>>();
  const queue = [...ordinarySets];
  while (queue.length > 0) {
    const source = queue.pop()!;
    for (const path of collectLocalRefTargets(sourcesBySet.get(source) ?? [])) {
      addPathToTrie(ordinaryTargets, path);
      let targetStates = stateCache.get(path);
      if (!targetStates) {
        targetStates = collectOverlappingPathStates(statePaths, path);
        stateCache.set(path, targetStates);
      }
      for (const state of targetStates) {
        const target = findSet(sourceSets, state);
        if (!ordinarySets.has(target)) {
          ordinarySets.add(target);
          queue.push(target);
        }
      }
    }
  }
}

function markVisitedPath(
  visited: WeakMap<object, Set<string>>,
  value: object,
  path: string,
): boolean {
  const paths = visited.get(value) ?? new Set<string>();
  if (paths.has(path)) {
    return true;
  }
  paths.add(path);
  visited.set(value, paths);
  return false;
}

function isShadowedRefPath(path: string, shadowedPaths: ShadowPathLayer | undefined): boolean {
  for (let layer = shadowedPaths; layer; layer = layer.parent) {
    if (pathOverlapsTrie(layer.paths, path)) {
      return true;
    }
  }
  return false;
}

function hasPathDescendantOrSelf(root: PathTrieNode, path: string): boolean {
  let node = root;
  for (const token of tokenizePath(path)) {
    const child = node.children.get(token);
    if (!child) {
      return false;
    }
    node = child;
  }
  return node.terminalPath !== undefined || node.children.size > 0;
}

function hasEmptyObjectOverlay(path: string, shadowedPaths: ShadowPathLayer | undefined): boolean {
  for (let layer = shadowedPaths; layer; layer = layer.parent) {
    if (hasPathDescendantOrSelf(layer.emptyObjectPaths, path)) {
      return true;
    }
  }
  return false;
}

function addShadowedValue(
  paths: PathTrieNode,
  emptyObjectPaths: PathTrieNode,
  path: string,
  value: unknown,
  visited: WeakSet<object>,
): boolean {
  if (!isMutableContainer(value) || Array.isArray(value)) {
    addPathToTrie(paths, path);
    return true;
  }
  if (visited.has(value)) {
    addPathToTrie(paths, path);
    return true;
  }
  visited.add(value);
  const entries = Object.entries(value);
  if (entries.length === 0) {
    addPathToTrie(emptyObjectPaths, path);
    return true;
  }
  let added = false;
  for (const [key, child] of entries) {
    added =
      addShadowedValue(paths, emptyObjectPaths, joinPointer(path, key), child, visited) || added;
  }
  return added;
}

function getTargetShadowedPaths(
  value: Record<string, unknown>,
  path: string,
  parent: ShadowPathLayer | undefined,
): ShadowPathLayer | undefined {
  const paths = createPathTrieNode();
  const emptyObjectPaths = createPathTrieNode();
  const visited = new WeakSet<object>();
  let added = false;
  for (const [key, child] of Object.entries(value)) {
    if (key !== '$ref') {
      added =
        addShadowedValue(paths, emptyObjectPaths, joinPointer(path, key), child, visited) || added;
    }
  }
  return added ? { emptyObjectPaths, parent, paths } : parent;
}

function setOrdinaryRefEdge(
  ordinaryRefEdges: OrdinaryRefEdges,
  parent: MutableContainer | undefined,
  key: string | undefined,
  target: string | null,
): void {
  if (!parent || key === undefined) {
    return;
  }
  const parentEdges = ordinaryRefEdges.get(parent) ?? new Map<string, string | null>();
  parentEdges.set(key, target);
  ordinaryRefEdges.set(parent, parentEdges);
}

function recordOrdinaryRef(
  root: unknown,
  item: TraversalItem,
  targets: PathTrieNode,
  ordinaryRefEdges: OrdinaryRefEdges,
  ordinaryRefPaths: OrdinaryRefPaths,
  ownerRefPaths: ReadonlySet<string>,
  recordTarget = true,
): ValueLocation | undefined {
  const { key, parent, path, physicalPath, shadowedRefPaths, value } = item;
  if (!isMutableContainer(value) || Array.isArray(value) || typeof value.$ref !== 'string') {
    return undefined;
  }

  const target = canonicalLocalRefPath(value.$ref);
  if (!ownerRefPaths.has(path) && !ownerRefPaths.has(physicalPath)) {
    const pureRef = getPureRef(value);
    if (recordTarget && target) {
      if (target !== '#' || !pureRef) {
        addPathToTrie(targets, target);
      }
    }
    if (pureRef) {
      if (
        !isShadowedRefPath(path, shadowedRefPaths) &&
        !hasEmptyObjectOverlay(path, shadowedRefPaths)
      ) {
        ordinaryRefPaths.set(path, target ?? null);
      }
      setOrdinaryRefEdge(ordinaryRefEdges, parent, key, target ?? null);
    } else if (target === '#') {
      ordinaryRefPaths.set(path, target);
      setOrdinaryRefEdge(ordinaryRefEdges, parent, key, target);
    }
  }
  return resolveLocalPointer(root, value.$ref);
}

function collectOrdinaryRefTargets(
  root: unknown,
  schemaPaths: PathTrieNode,
  ownerRefPaths: ReadonlySet<string>,
): {
  ordinaryRefEdges: OrdinaryRefEdges;
  ordinaryRefPaths: OrdinaryRefPaths;
  targets: PathTrieNode;
} {
  const targets = createPathTrieNode();
  const ordinaryRefEdges: OrdinaryRefEdges = new WeakMap();
  const ordinaryRefPaths: OrdinaryRefPaths = new Map();
  const visited = new WeakMap<object, Set<string>>();
  const visitedOrdinaryObjects = new WeakSet<object>();
  const stack: TraversalItem[] = [{ path: '#', physicalPath: '#', value: root }];
  const indexedRefObjects = new WeakSet<object>();
  const refReachable = new WeakSet<object>();
  indexRefReachableObjects(root, indexedRefObjects, refReachable);
  const ownerPaths = createPathTrieNode();
  for (const path of ownerRefPaths) {
    addPathToTrie(ownerPaths, path);
  }

  while (stack.length > 0) {
    const { ancestors, key, parent, path, physicalPath, shadowedRefPaths, value } = stack.pop()!;
    if (
      !isMutableContainer(value) ||
      !refReachable.has(value) ||
      hasPathAncestor(schemaPaths, path) ||
      hasPathAncestor(schemaPaths, physicalPath)
    ) {
      continue;
    }
    if (ancestors?.has(value)) {
      continue;
    }

    recordOrdinaryRef(
      root,
      { ancestors, key, parent, path, physicalPath, shadowedRefPaths, value },
      targets,
      ordinaryRefEdges,
      ordinaryRefPaths,
      ownerRefPaths,
    );

    const requiresPathVisit =
      ownerRefPaths.has(path) ||
      ownerRefPaths.has(physicalPath) ||
      pathOverlapsTrie(ownerPaths, path) ||
      pathOverlapsTrie(ownerPaths, physicalPath) ||
      pathOverlapsTrie(schemaPaths, path) ||
      pathOverlapsTrie(schemaPaths, physicalPath);
    if (
      requiresPathVisit ? markVisitedPath(visited, value, path) : visitedOrdinaryObjects.has(value)
    ) {
      continue;
    }
    if (!requiresPathVisit) {
      visitedOrdinaryObjects.add(value);
    }

    const childAncestors = new Set(ancestors);
    childAncestors.add(value);

    for (const [key, child] of Object.entries(value)) {
      stack.push({
        ancestors: childAncestors,
        key,
        parent: value,
        path: joinPointer(path, key),
        physicalPath: joinPointer(physicalPath, key),
        shadowedRefPaths,
        value: child,
      });
    }
  }

  return { ordinaryRefEdges, ordinaryRefPaths, targets };
}

function collectDetachedRefProvenance(
  root: unknown,
  schemaPaths: PathTrieNode,
  ordinarySourcePaths: ReadonlySet<string>,
  detachedPaths: ReadonlySet<string>,
  ownerRefPaths: ReadonlySet<string>,
  ordinaryRefEdges: OrdinaryRefEdges,
  ordinaryRefPaths: OrdinaryRefPaths,
): void {
  if (detachedPaths.size === 0) {
    return;
  }

  const detachedPathTrie = createPathTrieNode();
  for (const path of detachedPaths) {
    addPathToTrie(detachedPathTrie, path);
  }
  const ordinarySchemaPaths = createPathTrieNode();
  for (const path of ordinarySourcePaths) {
    addPathToTrie(ordinarySchemaPaths, path);
  }
  const ignoredTargets = createPathTrieNode();
  const visited = new WeakMap<object, Set<string>>();
  const stack: TraversalItem[] = [{ path: '#', physicalPath: '#', value: root }];
  let provenancePaths = 0;

  while (stack.length > 0) {
    const { ancestors, key, parent, path, physicalPath, shadowedRefPaths, value } = stack.pop()!;
    if (
      !isMutableContainer(value) ||
      !pathOverlapsTrie(detachedPathTrie, path) ||
      hasPathAncestor(schemaPaths, path) ||
      (hasPathAncestor(schemaPaths, physicalPath) &&
        !hasPathAncestor(ordinarySchemaPaths, physicalPath))
    ) {
      continue;
    }
    if (ancestors?.has(value) || markVisitedPath(visited, value, path)) {
      continue;
    }

    const childAncestors = new Set(ancestors);
    childAncestors.add(value);
    const targetLocation = recordOrdinaryRef(
      root,
      { ancestors, key, parent, path, physicalPath, shadowedRefPaths, value },
      ignoredTargets,
      ordinaryRefEdges,
      ordinaryRefPaths,
      ownerRefPaths,
      false,
    );
    const ownerRef = ownerRefPaths.has(path) || ownerRefPaths.has(physicalPath);
    if (
      targetLocation &&
      targetLocation.value !== value &&
      (!getPureRef(value) ||
        ownerRef ||
        isShadowedRefPath(path, shadowedRefPaths) ||
        hasEmptyObjectOverlay(path, shadowedRefPaths))
    ) {
      provenancePaths++;
      if (provenancePaths > MAX_REF_PROVENANCE_PATHS) {
        throw new Error(
          `Config ref provenance exceeds the ${MAX_REF_PROVENANCE_PATHS.toLocaleString()} path safety limit`,
        );
      }
      const targetShadowedPaths = getTargetShadowedPaths(
        value as Record<string, unknown>,
        path,
        shadowedRefPaths,
      );
      stack.push({
        ...targetLocation,
        ancestors,
        physicalPath: targetLocation.path,
        shadowedRefPaths: targetShadowedPaths,
        path,
      });
    }

    for (const [childKey, child] of Object.entries(value)) {
      stack.push({
        ancestors: childAncestors,
        key: childKey,
        parent: value,
        path: joinPointer(path, childKey),
        physicalPath: joinPointer(physicalPath, childKey),
        shadowedRefPaths,
        value: child,
      });
    }
  }
}

function countOverlayProperties(value: Record<string, unknown>): number {
  const visited = new WeakSet<object>();
  const stack = Object.entries(value)
    .filter(([key]) => key !== '$ref')
    .map(([, child]) => child);
  let properties = stack.length;
  while (stack.length > 0 && properties <= MAX_REF_EXPANSION_PROPERTIES) {
    const child = stack.pop();
    if (!isMutableContainer(child) || visited.has(child)) {
      continue;
    }
    visited.add(child);
    const values = Object.values(child);
    properties += values.length;
    for (const value of values) {
      stack.push(value);
    }
  }
  return properties;
}

function getExpandedRefProperties(
  root: unknown,
  start: Record<string, unknown>,
  memo: WeakMap<object, number>,
): number {
  const chain: Record<string, unknown>[] = [];
  const pending = new Set<object>();
  let current: unknown = start;
  let properties = 0;
  while (isMutableContainer(current) && !Array.isArray(current)) {
    const cached = memo.get(current);
    if (cached !== undefined) {
      properties = cached;
      break;
    }
    if (pending.has(current)) {
      break;
    }
    if (typeof current.$ref !== 'string') {
      properties = Object.keys(current).length;
      break;
    }
    pending.add(current);
    chain.push(current);
    const target = resolveLocalPointer(root, current.$ref);
    if (!target) {
      break;
    }
    current = target.value;
  }

  for (let index = chain.length - 1; index >= 0; index--) {
    const ref = chain[index];
    if (!getPureRef(ref)) {
      properties += countOverlayProperties(ref);
    }
    properties = Math.min(properties, MAX_REF_EXPANSION_PROPERTIES + 1);
    memo.set(ref, properties);
  }
  return memo.get(start) ?? properties;
}

function assertRefExpansionWithinLimit(root: unknown): void {
  const visited = new WeakSet<object>();
  const expanded = new WeakMap<object, number>();
  const stack = [root];
  let properties = 0;
  while (stack.length > 0) {
    const value = stack.pop();
    if (!isMutableContainer(value) || visited.has(value)) {
      continue;
    }
    visited.add(value);
    if (!Array.isArray(value) && typeof value.$ref === 'string' && !getPureRef(value)) {
      properties += getExpandedRefProperties(root, value, expanded);
      if (properties > MAX_REF_EXPANSION_PROPERTIES) {
        throw new Error(
          `Config ref expansion exceeds the ${MAX_REF_EXPANSION_PROPERTIES.toLocaleString()} property safety limit`,
        );
      }
    }
    for (const child of Object.values(value)) {
      stack.push(child);
    }
  }
}

function setPointerValue(root: unknown, path: string, value: unknown): void {
  const location = resolveCanonicalPointer(root, path);
  if (location) {
    setValue(location.parent, location.key, value);
  }
}

async function collectSchemaStates(
  root: unknown,
  source: SchemaSource,
  replacements: Map<object, PlaceholderReplacement>,
  originalRefs: WeakMap<object, string>,
  schemaFileDocuments: ReferencedDocumentCache,
  schemaFileBasePath: string,
  snapshotMemo: WeakMap<object, unknown>,
  rawSources: WeakMap<object, object>,
): Promise<{ ownerRefPaths: Set<string>; states: SchemaState[] }> {
  const { ownerRefPaths, records } = collectStandaloneSchemaLocations(root, source);
  const states: SchemaState[] = [];
  for (const record of records.values()) {
    const resolved = resolveConfigLevelSchemaRef(root, record.source.value);
    if (resolved) {
      ownerRefPaths.add(record.source.path);
    }
    let restoreValue = resolved?.value ?? record.source.value;
    const rootRef = getPureRef(restoreValue);
    const preserveNamedRootRef = Boolean(
      rootRef && /^file:\/\//i.test(rootRef) && hasNamedFragment(rootRef, rootRef),
    );
    const schemaFileAlreadyLoaded = [record.source, ...(resolved?.locations ?? [])].some(
      ({ value }) => isMutableContainer(value) && /^file:\/\//i.test(originalRefs.get(value) ?? ''),
    );
    if (
      rootRef &&
      /^file:\/\//i.test(rootRef) &&
      !preserveNamedRootRef &&
      !schemaFileAlreadyLoaded
    ) {
      restoreValue = (
        await loadSchemaFileReference(rootRef, schemaFileDocuments, schemaFileBasePath)
      ).value;
    }
    const sources = [record.source, ...(resolved?.locations ?? [])];
    const snapshotSource = isMutableContainer(restoreValue)
      ? (rawSources.get(restoreValue) ?? restoreValue)
      : restoreValue;
    states.push({
      activationPaths: record.activationPaths,
      detachPath: record.detachPath,
      forceParse: resolved?.unresolved && !preserveNamedRootRef,
      outputPath: record.outputPath,
      restoreValue: cloneSchemaSnapshot(
        snapshotSource,
        replacements,
        snapshotMemo,
        originalRefs,
        rawSources,
      ),
      sources,
    });
  }
  return { ownerRefPaths, states };
}

function collectOrdinarySourcePaths(
  root: unknown,
  states: SchemaState[],
  ownerRefPaths: ReadonlySet<string>,
): {
  detachedPaths: Set<string>;
  ordinaryRefEdges: OrdinaryRefEdges;
  ordinaryRefPaths: OrdinaryRefPaths;
  ordinarySourcePaths: Set<string>;
} {
  const schemaPaths = createPathTrieNode();
  const sourcePaths: SourcePath[] = [];
  for (let state = 0; state < states.length; state++) {
    addPathToTrie(schemaPaths, states[state].outputPath);
    for (const { path } of states[state].sources) {
      addPathToTrie(schemaPaths, path, state);
      sourcePaths.push({ path, state });
    }
  }
  const {
    ordinaryRefEdges,
    ordinaryRefPaths,
    targets: ordinaryTargets,
  } = collectOrdinaryRefTargets(root, schemaPaths, ownerRefPaths);

  // A state joins every path in one schema source chain. Trie ancestors add the remaining overlap
  // edges, so the disjoint sets are the same transitive closure as repeated pairwise path scans.
  const sourceSets = createDisjointSet(states.length);
  connectOverlappingSourceStates(schemaPaths, sourceSets);

  const ordinarySets = new Set<number>();
  for (let state = 0; state < states.length; state++) {
    if (states[state].forceParse) {
      ordinarySets.add(findSet(sourceSets, state));
    }
  }
  for (const { path, state } of sourcePaths) {
    if (pathOverlapsTrie(ordinaryTargets, path)) {
      ordinarySets.add(findSet(sourceSets, state));
    }
  }
  for (let state = 0; state < states.length; state++) {
    if (
      pathOverlapsTrie(ordinaryTargets, states[state].outputPath) ||
      states[state].activationPaths.some((path) => pathOverlapsTrie(ordinaryTargets, path))
    ) {
      ordinarySets.add(findSet(sourceSets, state));
    }
  }
  const { sourcesBySet, statePaths } = indexSourceStates(states, sourceSets);
  activateSourceDependencies(ordinarySets, sourceSets, sourcesBySet, statePaths, ordinaryTargets);

  const ordinarySourcePaths = new Set<string>();
  for (const { path, state } of sourcePaths) {
    if (ordinarySets.has(findSet(sourceSets, state))) {
      ordinarySourcePaths.add(path);
    }
  }

  const detachedPaths = new Set<string>();
  for (const { detachPath, outputPath } of states) {
    if (detachPath) {
      detachedPaths.add(detachPath);
    }
    const ancestor =
      ordinaryTargets.terminalPath === '#'
        ? outputPath.match(/^#\/[^/]+/)?.[0]
        : findShallowestProperAncestor(ordinaryTargets, outputPath);
    if (ancestor) {
      detachedPaths.add(ancestor);
    }
  }
  collectDetachedRefProvenance(
    root,
    schemaPaths,
    ordinarySourcePaths,
    detachedPaths,
    ownerRefPaths,
    ordinaryRefEdges,
    ordinaryRefPaths,
  );
  return {
    detachedPaths,
    ordinaryRefEdges,
    ordinaryRefPaths,
    ordinarySourcePaths,
  };
}

function detachPaths<T>(
  result: T,
  paths: ReadonlySet<string>,
  ordinaryRefEdges: OrdinaryRefEdges,
  ordinaryRefPaths: OrdinaryRefPaths,
  replacements: Map<object, PlaceholderReplacement>,
): void {
  const pathTrie = createPathTrieNode();
  for (const path of paths) {
    addPathToTrie(pathTrie, path);
  }
  const locations: ValueLocation[] = [];
  const stack = [pathTrie];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.terminalPath !== undefined) {
      const location = resolveCanonicalPointer(result, node.terminalPath);
      if (location) {
        locations.push(location);
      }
      continue;
    }
    for (const child of node.children.values()) {
      stack.push(child);
    }
  }

  const preservedAncestors = new WeakSet<object>();
  for (const { path } of locations) {
    let current: unknown = result;
    for (const token of tokenizePath(path)) {
      if (!isMutableContainer(current)) {
        break;
      }
      preservedAncestors.add(current);
      const decodedToken = token.replace(/~1/g, '/').replace(/~0/g, '~');
      current = hasOwn(current, decodedToken) ? getValue(current, decodedToken) : undefined;
    }
  }

  const clones = cloneDetachedValues(
    locations,
    replacements,
    preservedAncestors,
    pathTrie,
    ordinaryRefEdges,
    ordinaryRefPaths,
  );
  for (const location of locations) {
    const clone = isMutableContainer(location.value) ? clones.get(location.value) : location.value;
    setValue(
      location.parent,
      location.key,
      restorePlaceholders(clone ?? location.value, replacements),
    );
  }
}

function addMask(
  masks: Map<MutableContainer, Map<string, unknown>>,
  location: ValueLocation,
  restoreValue: unknown,
): void {
  const parentMasks = masks.get(location.parent) ?? new Map<string, unknown>();
  if (!parentMasks.has(location.key)) {
    parentMasks.set(location.key, restoreValue);
  }
  masks.set(location.parent, parentMasks);
}

function restorePlaceholders<T>(value: T, replacements: Map<object, PlaceholderReplacement>): T {
  let root: unknown = value;
  const visited = new WeakSet<object>();
  const stack: Array<{ key?: string; parent?: MutableContainer; value: unknown }> = [{ value }];

  while (stack.length > 0) {
    const item = stack.pop()!;
    let current = item.value;
    let traverse = true;
    while (isMutableContainer(current) && replacements.has(current)) {
      const replacement = replacements.get(current)!;
      current = replacement.value;
      if (item.parent && item.key !== undefined) {
        setValue(item.parent, item.key, current);
      } else {
        root = current;
      }
      if (!replacement.traverse) {
        traverse = false;
        break;
      }
    }
    if (!traverse || !isMutableContainer(current) || visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const [key, child] of Object.entries(current)) {
      stack.push({ parent: current, key, value: child });
    }
  }

  return root as T;
}

/**
 * Dereference Promptfoo config refs without interpreting refs owned by embedded JSON Schemas.
 *
 * The parser resolves files and URLs before its exclusion hook runs, so schema subtrees must be
 * physically hidden first. A pure local `$ref` at a schema root keeps its established meaning as a
 * Promptfoo config ref; refs inside the selected schema remain untouched.
 */
export async function dereferenceWithStandaloneSchemas<T extends object>(
  value: T,
  source: SchemaSource,
  options: DereferenceOptions = {},
): Promise<T> {
  if (options.disabled) {
    return value;
  }

  const schemaFileDocuments: ReferencedDocumentCache = new Map();
  // Raw YAML/JSON is cloned so failed dereferences and concurrent loads cannot mutate the caller.
  // Non-cyclic aliases are detached so an unprotected alias cannot expose a masked schema.
  const replacements = new Map<object, PlaceholderReplacement>();
  const cloneBudget: CloneBudget = { aliasClones: 0, seen: new WeakSet<object>() };
  const rawSources = new WeakMap<object, object>();
  const workingValue = cloneConfigValue(value, replacements, cloneBudget, undefined, rawSources);
  const originalRefs = new WeakMap<object, string>();
  if (options.jsonlRowRoots && Array.isArray(workingValue)) {
    rebaseJsonlRowRefs(workingValue, originalRefs);
  }
  const externalRefs = await localizeExternalConfigRefs(
    workingValue as MutableContainer,
    source,
    replacements,
    cloneBudget,
    rawSources,
    originalRefs,
    schemaFileDocuments,
    options.schemaFileBasePath ?? '',
  );
  const snapshotMemo = new WeakMap<object, unknown>();
  const analyze = async () => {
    const { ownerRefPaths, states } = await collectSchemaStates(
      workingValue,
      source,
      replacements,
      originalRefs,
      schemaFileDocuments,
      options.schemaFileBasePath ?? '',
      snapshotMemo,
      rawSources,
    );
    return {
      ordinary:
        states.length === 0
          ? undefined
          : collectOrdinarySourcePaths(workingValue, states, ownerRefPaths),
      states,
    };
  };
  const getMaskedRoots = (
    states: SchemaState[],
    ordinarySourcePaths: ReadonlySet<string>,
  ): WeakSet<object> => {
    const ordinaryRoots = new WeakSet<object>();
    for (const state of states) {
      for (const location of state.sources) {
        if (ordinarySourcePaths.has(location.path) && isMutableContainer(location.value)) {
          ordinaryRoots.add(location.value);
        }
      }
    }
    const maskedRoots = new WeakSet<object>();
    for (const state of states) {
      for (const location of state.sources) {
        if (
          !ordinarySourcePaths.has(location.path) &&
          isMutableContainer(location.value) &&
          !ordinaryRoots.has(location.value)
        ) {
          maskedRoots.add(location.value);
        }
      }
    }
    return maskedRoots;
  };

  let analysis = await analyze();
  let { states } = analysis;
  if (states.length === 0) {
    await externalRefs.finish(new WeakSet<object>());
    const replayedRoot = externalRefs.prepareParserReplay();
    assertRefExpansionWithinLimit(workingValue);
    absolutizeRelativeFileRefs(workingValue, options.schemaFileBasePath ?? '');
    const result = restorePlaceholders(
      await dereferenceLocalizedRoot(
        workingValue,
        externalRefs.getMount(),
        schemaFileDocuments,
        externalRefs.getParserDocument,
        externalRefs.isReplayDocument,
        replayedRoot,
      ),
      replacements,
    );
    restoreSurvivingExternalRefs(
      result,
      externalRefs.getMount(),
      originalRefs,
      externalRefs.getRefProvenance,
    );
    removeExternalRefMount(result, externalRefs.getMount());
    return result;
  }

  if (externalRefs.getMount()) {
    let converged = false;
    for (let pass = 0; pass < MAX_EXTERNAL_REF_PASSES; pass++) {
      const revision = externalRefs.getRevision();
      await externalRefs.finish(
        getMaskedRoots(analysis.states, analysis.ordinary!.ordinarySourcePaths),
      );
      analysis = await analyze();
      if (externalRefs.getRevision() === revision) {
        converged = true;
        break;
      }
    }
    if (!converged) {
      throw new Error(
        `Config external refs did not converge within the ${MAX_EXTERNAL_REF_PASSES} pass safety limit`,
      );
    }
    states = analysis.states;
  }
  const { detachedPaths, ordinaryRefEdges, ordinaryRefPaths, ordinarySourcePaths } =
    analysis.ordinary!;

  const masks = new Map<MutableContainer, Map<string, unknown>>();
  for (const state of states) {
    for (const location of state.sources) {
      if (!ordinarySourcePaths.has(location.path)) {
        addMask(masks, location, location.value);
      }
    }
  }

  for (const [parent, parentMasks] of masks) {
    for (const [key, restoreValue] of parentMasks) {
      const placeholder = {};
      replacements.set(placeholder, { traverse: true, value: restoreValue });
      setValue(parent, key, placeholder);
    }
  }

  const replayedRoot = externalRefs.prepareParserReplay();
  assertRefExpansionWithinLimit(workingValue);
  absolutizeRelativeFileRefs(workingValue, options.schemaFileBasePath ?? '');

  const result = restorePlaceholders(
    await dereferenceLocalizedRoot(
      workingValue,
      externalRefs.getMount(),
      schemaFileDocuments,
      externalRefs.getParserDocument,
      externalRefs.isReplayDocument,
      replayedRoot,
    ),
    replacements,
  );
  restoreSurvivingExternalRefs(
    result,
    externalRefs.getMount(),
    originalRefs,
    externalRefs.getRefProvenance,
  );
  detachPaths(result, detachedPaths, ordinaryRefEdges, ordinaryRefPaths, replacements);
  const restoredValues = new WeakMap<object, unknown>();
  const getRestoredValue = (value: unknown): unknown => {
    if (!isMutableContainer(value)) {
      return value;
    }
    if (restoredValues.has(value)) {
      return restoredValues.get(value);
    }
    const restored = restorePlaceholders(value, replacements);
    restoredValues.set(value, restored);
    return restored;
  };
  for (const state of states) {
    setPointerValue(result, state.outputPath, getRestoredValue(state.restoreValue));
  }
  restoreSurvivingExternalRefs(
    result,
    externalRefs.getMount(),
    originalRefs,
    externalRefs.getRefProvenance,
  );
  removeExternalRefMount(result, externalRefs.getMount());
  return result;
}
