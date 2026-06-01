import { InvalidArgumentError } from 'commander';

export function collectKeyValueOption(
  optionName: string,
  value: string,
  previous: Record<string, string> | undefined,
): Record<string, string> {
  const separatorIndex = value.indexOf('=');
  const key = separatorIndex === -1 ? '' : value.slice(0, separatorIndex);
  const val = separatorIndex === -1 ? undefined : value.slice(separatorIndex + 1);

  if (!key || val === undefined) {
    throw new InvalidArgumentError(`${optionName} must be specified in key=value format.`);
  }

  return { ...previous, [key]: val };
}

/**
 * Normalize Commander's repeatable `--tag` option into the canonical `tags` field.
 *
 * Commander accumulates `--tag key=value` flags under the transient `tag` key (see the
 * `collectKeyValueOption` coercion). This collapses that alias into `tags`, dropping `tag`
 * so only the canonical field survives. CLI tags (`tag`) take precedence over any
 * pre-existing `tags`. Returns a new object; the input is not mutated. When neither field
 * is present, no `tags` key is added.
 */
export function normalizeTagOption<
  T extends { tag?: Record<string, string>; tags?: Record<string, string> },
>(rawOpts: T): Omit<T, 'tag'> {
  const { tag, ...rest } = rawOpts;
  const tags = tag ?? rest.tags;
  return tags === undefined ? rest : { ...rest, tags };
}
