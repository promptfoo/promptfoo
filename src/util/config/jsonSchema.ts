import $RefParser from '@apidevtools/json-schema-ref-parser';

type MutableContainer = Record<string, unknown> | unknown[];
type SchemaSource = 'config' | 'tests';
type PlaceholderReplacement = { traverse: boolean; value: unknown };
type DereferenceOptions = { disabled?: boolean };

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
    if (
      key !== undefined &&
      parent &&
      (isStandaloneSchemaPath(path, source) || isAssertionSchemaPath(path, parent, source))
    ) {
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

  for (const [parent, parentMasks] of masks) {
    for (const [key, restoreValue] of parentMasks) {
      const placeholder = {};
      replacements.set(placeholder, { traverse: true, value: restoreValue });
      setValue(parent, key, placeholder);
    }
  }

  const result = (await $RefParser.dereference(workingValue)) as T;
  return restorePlaceholders(result, replacements);
}
