import $RefParser from '@apidevtools/json-schema-ref-parser';

type MutableContainer = Record<string, unknown> | unknown[];
type SchemaSource = 'config' | 'tests';

type ValueLocation = {
  parent: MutableContainer;
  key: string;
  value: unknown;
};

type TraversalItem = Partial<Pick<ValueLocation, 'key' | 'parent'>> & {
  ancestors?: ReadonlySet<object>;
  path: string;
  value: unknown;
};

const SCHEMA_PATH_SUFFIX =
  /\/(?:tools\/\d+\/function\/parameters|functions\/\d+\/parameters|response_format\/(?:json_schema\/)?schema)$/;

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

function cloneConfigValue<T>(
  value: T,
  ancestors: object[] = [],
  ancestorClones: unknown[] = [],
): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const ancestorIndex = ancestors.indexOf(value);
  if (ancestorIndex !== -1) {
    return ancestorClones[ancestorIndex] as T;
  }
  if (value instanceof Date || value instanceof RegExp || value instanceof ArrayBuffer) {
    return structuredClone(value);
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value) as T;
  }
  if (ArrayBuffer.isView(value)) {
    return structuredClone(value);
  }

  const result: unknown = Array.isArray(value)
    ? new Array(value.length)
    : value instanceof Map
      ? new Map()
      : value instanceof Set
        ? new Set()
        : {};
  ancestors.push(value);
  ancestorClones.push(result);

  if (value instanceof Map && result instanceof Map) {
    for (const [key, item] of value) {
      result.set(
        cloneConfigValue(key, ancestors, ancestorClones),
        cloneConfigValue(item, ancestors, ancestorClones),
      );
    }
  } else if (value instanceof Set && result instanceof Set) {
    for (const item of value) {
      result.add(cloneConfigValue(item, ancestors, ancestorClones));
    }
  } else {
    for (const key of Object.keys(value)) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: cloneConfigValue((value as Record<string, unknown>)[key], ancestors, ancestorClones),
        writable: true,
      });
    }
  }

  ancestors.pop();
  ancestorClones.pop();
  return result as T;
}

function joinPointer(path: string, key: string): string {
  return `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function resolveLocalPointer(root: unknown, ref: string): ValueLocation | undefined {
  if (!ref.startsWith('#/') || !isMutableContainer(root)) {
    return undefined;
  }

  let pointer: string;
  try {
    pointer = decodeURIComponent(ref.slice(2));
  } catch {
    return undefined;
  }

  const tokens = pointer.split('/').map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
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

  return { parent, key, value: current };
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
  if (
    /^#\/(?:providers|targets)\/\d+(?:\/[^/]+)?\/config$/.test(path) ||
    /^#\/prompts\/\d+(?:\/[^/]+)?\/config$/.test(path) ||
    /^#\/redteam\/provider(?:\/[^/]+)?\/config$/.test(path)
  ) {
    return true;
  }

  const suffix = getTestPathSuffix(path, source);
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

function collectStandaloneSchemaLocations(root: unknown, source: SchemaSource): ValueLocation[] {
  const locations: ValueLocation[] = [];
  const seenLocations = new Map<MutableContainer, Set<string>>();
  const visited = new WeakMap<object, Set<string>>();
  const stack: TraversalItem[] = [{ path: '#', value: root }];

  const addLocation = (location: ValueLocation) => {
    const keys = seenLocations.get(location.parent) ?? new Set<string>();
    if (!keys.has(location.key)) {
      keys.add(location.key);
      seenLocations.set(location.parent, keys);
      locations.push(location);
    }
  };

  while (stack.length > 0) {
    const { ancestors, key, parent, path, value } = stack.pop()!;
    if (!isMutableContainer(value)) {
      continue;
    }
    if (key !== undefined && parent && isStandaloneSchemaPath(path, source)) {
      addLocation({ key, parent, value });
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
        stack.push({ ...target, ancestors: childAncestors, path });
      }
    }

    for (const [childKey, child] of Object.entries(value)) {
      stack.push({
        key: childKey,
        parent: value,
        ancestors: childAncestors,
        path: joinPointer(path, childKey),
        value: child,
      });
    }
  }

  return locations;
}

function resolveConfigLevelSchemaRef(
  root: unknown,
  schema: unknown,
): { locations: ValueLocation[]; value: unknown } | undefined {
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
      break;
    }
    locations.push(location);
    value = location.value;
    ref = getPureRef(value) ?? '';
  }

  return locations.length > 0 ? { locations, value } : undefined;
}

function addMask(
  masks: Map<MutableContainer, Map<string, unknown>>,
  location: ValueLocation,
  restoreValue: unknown,
  overwrite: boolean = false,
): void {
  const parentMasks = masks.get(location.parent) ?? new Map<string, unknown>();
  if (overwrite || !parentMasks.has(location.key)) {
    parentMasks.set(location.key, restoreValue);
  }
  masks.set(location.parent, parentMasks);
}

function restorePlaceholders<T>(value: T, replacements: Map<object, unknown>): T {
  let root: unknown = value;
  const visited = new WeakSet<object>();
  const stack: Array<{ key?: string; parent?: MutableContainer; value: unknown }> = [{ value }];

  while (stack.length > 0) {
    const item = stack.pop()!;
    let current = item.value;
    while (isMutableContainer(current) && replacements.has(current)) {
      current = replacements.get(current);
      if (item.parent && item.key !== undefined) {
        setValue(item.parent, item.key, current);
      } else {
        root = current;
      }
    }
    if (!isMutableContainer(current) || visited.has(current)) {
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
): Promise<T> {
  // Raw YAML/JSON is cloned so failed dereferences and concurrent loads cannot mutate the caller.
  // Non-cyclic aliases are detached so an unprotected alias cannot expose a masked schema.
  const workingValue = cloneConfigValue(value);
  const schemaLocations = collectStandaloneSchemaLocations(workingValue, source);
  const masks = new Map<MutableContainer, Map<string, unknown>>();

  for (const location of schemaLocations) {
    const resolved = resolveConfigLevelSchemaRef(workingValue, location.value);
    if (!resolved) {
      addMask(masks, location, location.value);
      continue;
    }
    for (const target of resolved.locations) {
      addMask(masks, target, resolved.value, true);
    }
  }

  const replacements = new Map<object, unknown>();
  for (const [parent, parentMasks] of masks) {
    for (const [key, restoreValue] of parentMasks) {
      const placeholder = {};
      replacements.set(placeholder, restoreValue);
      setValue(parent, key, placeholder);
    }
  }

  const result = (await $RefParser.dereference(workingValue)) as T;
  return restorePlaceholders(result, replacements);
}
