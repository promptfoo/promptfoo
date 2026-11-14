import * as yaml from 'js-yaml';

type LegacyYamlSet = Record<string, unknown>;

const legacySetTag = yaml.defineMappingTag<LegacyYamlSet>('tag:yaml.org,2002:set', {
  ...yaml.legacyMapTag,
  identify: yaml.setTag.identify,
  represent: yaml.setTag.represent,
  addPair: (container, key, value) => {
    if (value !== null) {
      return 'cannot resolve a set item';
    }
    return yaml.legacyMapTag.addPair(container, key, null);
  },
});

/**
 * Schema preserving js-yaml v4's default handling of user-authored YAML.
 * v5's CORE_SCHEMA drops merge keys and the legacy standard tags that v4's
 * DEFAULT_SCHEMA accepted. Its built-in setTag also constructs a JavaScript
 * Set, while v4 returned an object whose keys map to null.
 */
const LEGACY_COLLECTION_SCHEMA = yaml.CORE_SCHEMA.withTags(
  yaml.mergeTag,
  yaml.binaryTag,
  yaml.omapTag,
  yaml.pairsTag,
  legacySetTag,
);

const YAML_LOAD_SCHEMA = LEGACY_COLLECTION_SCHEMA.withTags(yaml.timestampTag);

const timestampStringTag = yaml.defineScalarTag<string>(yaml.timestampTag.tagName, {
  ...yaml.timestampTag,
  identify: () => false,
  resolve(source, isExplicit, tagName) {
    const value = yaml.timestampTag.resolve(source, isExplicit, tagName);
    if (value === yaml.NOT_RESOLVED) {
      return value;
    }
    // Date-only literals and midnight timestamps represent different inputs.
    return /^\d{4}-\d{2}-\d{2}$/.test(source) ? source : value.toISOString();
  },
});

const CONFIG_YAML_SCHEMA = LEGACY_COLLECTION_SCHEMA.withTags(timestampStringTag);

export function loadConfigYaml(content: string): unknown {
  return loadYaml(content, { schema: CONFIG_YAML_SCHEMA });
}

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
