import * as yaml from 'js-yaml';

/**
 * Schema preserving js-yaml v4's default handling of user-authored YAML:
 * v5's CORE_SCHEMA (the new `load` default) drops YAML merge keys (`<<:`),
 * which promptfoo configs, test files, and provider configs rely on.
 */
const YAML_LOAD_SCHEMA = yaml.CORE_SCHEMA.withTags(yaml.mergeTag);

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
