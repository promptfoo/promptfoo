type Metadata = { __promptfoo?: { literalVars?: unknown } };

/** Generated variables and their inputVars copies must remain literal through config loading and evaluation. */
export function getLiteralVarNames(parent: object, field = 'vars'): string[] | undefined {
  const metadata =
    field === 'vars'
      ? (parent as { metadata?: Metadata }).metadata
      : field === 'inputVars'
        ? (parent as Metadata)
        : undefined;
  const names = metadata?.__promptfoo?.literalVars;
  // Old exports can redact a secret-shaped name in this list while retaining the
  // original key in vars. Its value must never fall through to file/template loading.
  if (Array.isArray(names) && names.includes('[REDACTED]') && field in parent) {
    throw new Error(
      'Cannot replay redacted literal variable names. Regenerate the test with short variable names.',
    );
  }
  return Array.isArray(names) && names.every((name) => typeof name === 'string')
    ? names
    : undefined;
}

/** Apply config processing to operator fields while preserving a generated row's literal values. */
export function processConfigField(
  parent: object,
  key: string,
  value: unknown,
  processValue: (child: unknown) => unknown,
): unknown {
  const keys = getLiteralVarNames(parent, key);
  if (!keys || !value || typeof value !== 'object' || Array.isArray(value)) {
    return processValue(value);
  }
  return Object.fromEntries(
    Object.entries(value).map(([name, child]) => [
      name,
      keys.includes(name) ? child : processValue(child),
    ]),
  );
}
