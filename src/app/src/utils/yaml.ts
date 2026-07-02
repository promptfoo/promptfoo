import * as yaml from 'js-yaml';

/**
 * Schema preserving js-yaml v4's default handling of user-authored YAML:
 * v5's CORE_SCHEMA (the new `load` default) drops YAML merge keys (`<<:`),
 * which promptfoo configs rely on (and the CLI loader still supports).
 */
const YAML_LOAD_SCHEMA = yaml.CORE_SCHEMA.withTags(yaml.mergeTag);

/**
 * Load a single YAML document with js-yaml v4-compatible semantics:
 * merge keys (`<<:`) are applied, and empty documents (empty, whitespace-only,
 * or comment-only input) return `undefined` instead of throwing.
 */
export function loadYaml(content: string, options?: yaml.LoadOptions): unknown {
  try {
    return yaml.load(content, { schema: YAML_LOAD_SCHEMA, ...options });
  } catch (err) {
    if (
      err instanceof yaml.YAMLException &&
      err.reason === 'expected a document, but the input is empty'
    ) {
      return undefined;
    }
    throw err;
  }
}
