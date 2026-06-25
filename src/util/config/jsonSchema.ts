import $RefParser from '@apidevtools/json-schema-ref-parser';

type MutableContainer = Record<string, unknown> | unknown[];
type SchemaSource = 'config' | 'tests';
type PlaceholderReplacement = { traverse: boolean; value: unknown };
type DereferenceOptions = { disabled?: boolean };

type ValueLocation = {
  parent: MutableContainer;
  key: string;
  path: string;
  value: unknown;
};

type TraversalItem = Partial<Pick<ValueLocation, 'key' | 'parent'>> & {
  ancestors?: ReadonlySet<object>;
  physicalPath: string;
  refPaths?: ReadonlySet<string>;
  path: string;
  value: unknown;
};

type SchemaRecord = {
  detachPath?: string;
  outputPath: string;
  source: ValueLocation;
};

type SchemaState = {
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

const SCHEMA_PATH_SUFFIX =
  /\/(?:format\/schema|generationConfig\/response_schema|outputType\/schema|output_schema|output_format\/schema|responseSchema|toolConfig\/tools\/\d+\/toolSpec\/inputSchema\/json|tools\/\d+\/(?:function\/parameters|functionDeclarations\/\d+\/(?:parameters|response)|input_schema|parameters|toolSpec\/inputSchema\/json)|functions\/\d+\/parameters|response_format\/(?:json_schema\/)?schema)$/;

function isMutableContainer(value: unknown): value is MutableContainer {
  return typeof value === 'object' && value !== null;
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
    return placeholder as T;
  }

  // Programmatic configs can contain provider and SDK instances. Keep them opaque so cloning or
  // ref-parser traversal cannot strip prototypes, private state, accessors, or symbol properties.
  if (!isJsonContainer(value)) {
    const placeholder = {};
    replacements.set(placeholder, { traverse: false, value });
    return placeholder as T;
  }

  const ancestorIndex = ancestors.indexOf(value);
  if (ancestorIndex !== -1) {
    return ancestorClones[ancestorIndex] as T;
  }

  const result: unknown = Array.isArray(value)
    ? new Array(value.length)
    : Object.create(Object.getPrototypeOf(value));
  ancestors.push(value);
  ancestorClones.push(result);

  for (const key of Object.keys(value)) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value: cloneConfigValue(
        (value as Record<string, unknown>)[key],
        replacements,
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

function joinPointer(path: string, key: string): string {
  return `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function getLocalRefTokens(ref: string): string[] | undefined {
  if (!ref.startsWith('#/')) {
    return undefined;
  }
  try {
    return decodeURIComponent(ref.slice(2))
      .split('/')
      .map((token) => decodeURIComponent(token).replace(/~1/g, '/').replace(/~0/g, '~'));
  } catch {
    return undefined;
  }
}

function resolveLocalPointer(root: unknown, ref: string): ValueLocation | undefined {
  const tokens = getLocalRefTokens(ref);
  if (!tokens || !isMutableContainer(root)) {
    return undefined;
  }
  let current: unknown = root;
  let parent: MutableContainer = root;
  let key = '';

  for (const token of tokens) {
    if (!isMutableContainer(current) || !hasOwn(current, token)) {
      return undefined;
    }
    parent = current;
    key = token;
    current = getValue(current, token);
  }

  return { parent, key, path: tokens.reduce(joinPointer, '#'), value: current };
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

function collectStandaloneSchemaLocations(
  root: unknown,
  source: SchemaSource,
): { ownerRefPaths: Set<string>; records: Map<string, SchemaRecord> } {
  const records = new Map<string, SchemaRecord>();
  const ownerRefPaths = new Set<string>();
  const visited = new WeakMap<object, Set<string>>();
  const stack: TraversalItem[] = [{ path: '#', physicalPath: '#', value: root }];

  const addRecord = (record: SchemaRecord, refPaths: ReadonlySet<string> | undefined) => {
    const previous = records.get(record.outputPath);
    if (!previous || record.source.path === record.outputPath) {
      records.set(record.outputPath, record);
    }
    for (const path of refPaths ?? []) {
      ownerRefPaths.add(path);
    }
  };

  while (stack.length > 0) {
    const { ancestors, key, parent, path, physicalPath, refPaths, value } = stack.pop()!;
    if (!isMutableContainer(value)) {
      continue;
    }
    if (
      key !== undefined &&
      parent &&
      (isStandaloneSchemaPath(path, source) || isAssertionSchemaPath(path, parent, source))
    ) {
      const detachPath = [...(refPaths ?? [])].find(
        (refPath) => refPath !== '#' && path.startsWith(`${refPath}/`),
      );
      addRecord(
        { detachPath, outputPath: path, source: { key, parent, path: physicalPath, value } },
        refPaths,
      );
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

    if (!Array.isArray(value) && typeof value.$ref === 'string') {
      const target = resolveLocalPointer(root, value.$ref);
      if (target && target.value !== value) {
        const nextRefPaths = new Set(refPaths);
        nextRefPaths.add(physicalPath);
        stack.push({
          ...target,
          ancestors: childAncestors,
          physicalPath: target.path,
          refPaths: nextRefPaths,
          path,
        });
      }
    }

    for (const [childKey, child] of Object.entries(value)) {
      stack.push({
        key: childKey,
        parent: value,
        ancestors: childAncestors,
        path: joinPointer(path, childKey),
        physicalPath: joinPointer(physicalPath, childKey),
        refPaths,
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

async function loadSchemaFileRef(ref: string): Promise<unknown> {
  const fragmentIndex = ref.indexOf('#');
  const documentRef = fragmentIndex === -1 ? ref : ref.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? undefined : ref.slice(fragmentIndex);
  const document = await new $RefParser().parse(documentRef);
  if (!fragment || fragment === '#') {
    return document;
  }

  const location = resolveLocalPointer(document, fragment);
  if (location) {
    return location.value;
  }

  // Preserve anchor handling and the reference parser's established error type for invalid file
  // pointers. Pointer fragments take the raw-document path above so refs below them stay intact.
  return $RefParser.dereference({ $ref: ref });
}

function canonicalLocalRefPath(ref: string): string | undefined {
  if (ref === '#') {
    return '#';
  }
  return getLocalRefTokens(ref)?.reduce(joinPointer, '#');
}

function createPathTrieNode(): PathTrieNode {
  return { children: new Map<string, PathTrieNode>() };
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

function collectOrdinaryRefTargets(
  root: unknown,
  schemaPaths: PathTrieNode,
  ownerRefPaths: ReadonlySet<string>,
): PathTrieNode {
  const targets = createPathTrieNode();
  const stack: Array<Pick<TraversalItem, 'ancestors' | 'path' | 'value'>> = [
    { path: '#', value: root },
  ];

  while (stack.length > 0) {
    const { ancestors, path, value } = stack.pop()!;
    if (!isMutableContainer(value) || hasPathAncestor(schemaPaths, path)) {
      continue;
    }
    if (ancestors?.has(value)) {
      continue;
    }

    if (!Array.isArray(value) && typeof value.$ref === 'string' && !ownerRefPaths.has(path)) {
      const target = canonicalLocalRefPath(value.$ref);
      if (target) {
        addPathToTrie(targets, target);
      }
    }

    const childAncestors = new Set(ancestors);
    childAncestors.add(value);
    for (const [key, child] of Object.entries(value)) {
      stack.push({
        ancestors: childAncestors,
        path: joinPointer(path, key),
        value: child,
      });
    }
  }

  return targets;
}

function setPointerValue(root: unknown, path: string, value: unknown): void {
  const location = resolveLocalPointer(root, path);
  if (location) {
    setValue(location.parent, location.key, value);
  }
}

async function collectSchemaStates(
  root: unknown,
  source: SchemaSource,
  replacements: Map<object, PlaceholderReplacement>,
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
    if (rootRef?.startsWith('file://')) {
      restoreValue = await loadSchemaFileRef(rootRef);
    }
    states.push({
      detachPath: record.detachPath,
      forceParse: resolved?.unresolved,
      outputPath: record.outputPath,
      restoreValue: cloneConfigValue(restoreValue, replacements),
      sources: [record.source, ...(resolved?.locations ?? [])],
    });
  }
  return { ownerRefPaths, states };
}

function collectOrdinarySourcePaths(
  root: unknown,
  states: SchemaState[],
  ownerRefPaths: ReadonlySet<string>,
): { ordinarySourcePaths: Set<string>; ordinaryTargets: PathTrieNode } {
  const schemaPaths = createPathTrieNode();
  const sourcePaths: SourcePath[] = [];
  for (let state = 0; state < states.length; state++) {
    for (const { path } of states[state].sources) {
      addPathToTrie(schemaPaths, path, state);
      sourcePaths.push({ path, state });
    }
  }
  const ordinaryTargets = collectOrdinaryRefTargets(root, schemaPaths, ownerRefPaths);

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

  const ordinarySourcePaths = new Set<string>();
  for (const { path, state } of sourcePaths) {
    if (ordinarySets.has(findSet(sourceSets, state))) {
      ordinarySourcePaths.add(path);
    }
  }
  return { ordinarySourcePaths, ordinaryTargets };
}

function detachPaths<T>(
  result: T,
  paths: ReadonlySet<string>,
  replacements: Map<object, PlaceholderReplacement>,
): void {
  const pathTrie = createPathTrieNode();
  for (const path of paths) {
    addPathToTrie(pathTrie, path);
  }
  const stack = [pathTrie];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.terminalPath !== undefined) {
      const location = resolveLocalPointer(result, node.terminalPath);
      if (location) {
        setValue(
          location.parent,
          location.key,
          restorePlaceholders(cloneConfigValue(location.value, replacements), replacements),
        );
      }
      continue;
    }
    stack.push(...node.children.values());
  }
}

function detachProviderBranches<T>(
  result: T,
  states: SchemaState[],
  ordinaryTargets: PathTrieNode,
  replacements: Map<object, PlaceholderReplacement>,
): void {
  const paths = new Set<string>();
  for (const { detachPath, outputPath } of states) {
    if (detachPath) {
      paths.add(detachPath);
    }
    const ancestor = findShallowestProperAncestor(ordinaryTargets, outputPath);
    if (ancestor) {
      paths.add(ancestor);
    }
  }
  detachPaths(result, paths, replacements);
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

  // Raw YAML/JSON is cloned so failed dereferences and concurrent loads cannot mutate the caller.
  // Non-cyclic aliases are detached so an unprotected alias cannot expose a masked schema.
  const replacements = new Map<object, PlaceholderReplacement>();
  const workingValue = cloneConfigValue(value, replacements);
  const { ownerRefPaths, states } = await collectSchemaStates(workingValue, source, replacements);
  const { ordinarySourcePaths, ordinaryTargets } = collectOrdinarySourcePaths(
    workingValue,
    states,
    ownerRefPaths,
  );

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

  const result = restorePlaceholders(
    (await $RefParser.dereference(workingValue)) as T,
    replacements,
  );
  detachProviderBranches(result, states, ordinaryTargets, replacements);
  for (const state of states) {
    setPointerValue(
      result,
      state.outputPath,
      restorePlaceholders(state.restoreValue, replacements),
    );
  }
  return result;
}
