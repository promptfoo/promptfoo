import * as yaml from 'js-yaml';
import { isPlainObject } from './objectUtils';

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

const UTC_MIDNIGHT_ISO = /^(\d{4}-\d{2}-\d{2})T00:00:00\.000Z$/;

/**
 * Formats a YAML timestamp as an ISO-8601 string in UTC, independent of the host time zone.
 * UTC midnight, which is what a date-only literal like `2024-01-02` parses to, becomes
 * `2024-01-02`; any other instant becomes `toISOString()`.
 */
export function formatYamlTimestamp(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return String(date);
  }
  const iso = date.toISOString();
  return UTC_MIDNIGHT_ISO.exec(iso)?.[1] ?? iso;
}

/**
 * Deeply replaces the `Date`s that `loadYaml` returns for unquoted timestamps with
 * {@link formatYamlTimestamp} strings, so config and test data match what JSON/CSV or a quoted
 * date would give. A `Date` would render time-zone dependently and fail string assertions.
 */
export function stringifyYamlTimestamps<T>(value: T): T {
  if (value instanceof Date) {
    return formatYamlTimestamp(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(stringifyYamlTimestamps) as T;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, stringifyYamlTimestamps(item)]),
    ) as T;
  }
  return value;
}
