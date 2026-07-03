import * as yaml from 'js-yaml';

type LegacyYamlSet = Record<string, null>;

const legacySetTag = yaml.defineMappingTag<LegacyYamlSet>('tag:yaml.org,2002:set', {
  create: () => ({}),
  identify: () => false,
  represent: (data) => new Map(Object.keys(data).map((key) => [key, null])),
  addPair: (container, key, value) => {
    if (value !== null) {
      return 'cannot resolve a set item';
    }
    if (key !== null && typeof key === 'object') {
      return 'object-based set does not support complex keys';
    }
    const normalizedKey = String(key);
    if (normalizedKey === '__proto__') {
      Object.defineProperty(container, normalizedKey, {
        value: null,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      container[normalizedKey] = null;
    }
    return '';
  },
  has: (container, key) => Object.prototype.hasOwnProperty.call(container, String(key)),
  keys: (container) => Object.keys(container),
  get: (container, key) => container[String(key)],
});

/**
 * Schema preserving js-yaml v4's default handling of user-authored YAML.
 * v5's CORE_SCHEMA drops merge keys and the legacy standard tags that v4's
 * DEFAULT_SCHEMA accepted. Its built-in setTag also constructs a JavaScript
 * Set, while v4 returned an object whose keys map to null.
 */
const YAML_LOAD_SCHEMA = yaml.CORE_SCHEMA.withTags(
  yaml.mergeTag,
  yaml.binaryTag,
  yaml.timestampTag,
  yaml.omapTag,
  yaml.pairsTag,
  legacySetTag,
);

/**
 * Load a single YAML document with js-yaml v4-compatible semantics:
 * merge keys (`<<:`) are applied, and empty documents (empty, whitespace-only,
 * or comment-only input) return `undefined` instead of throwing.
 */
export function loadYaml(content: string, options?: yaml.LoadOptions): unknown {
  // loadAll returns [] for empty documents, unlike v5's load which throws.
  const documents = yaml.loadAll(content, { schema: YAML_LOAD_SCHEMA, ...options });
  if (documents.length === 0) {
    return undefined;
  }
  if (documents.length > 1) {
    throw new yaml.YAMLException('expected a single document in the stream, but found more');
  }
  return documents[0];
}
