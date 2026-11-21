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

/** Keep only metadata required for safe replay after user metadata has been stripped. */
export function projectOperationalMetadata(
  metadata: unknown,
  keepVars: boolean,
  includeProviderOrigin = false,
) {
  const internal = (
    metadata as { __promptfoo?: { remote?: unknown; providerBasePath?: unknown } } | undefined
  )?.__promptfoo;
  const literalVars = keepVars ? getLiteralVarNames({ metadata }) : undefined;
  const origin =
    internal?.remote === true
      ? { remote: true }
      : includeProviderOrigin && typeof internal?.providerBasePath === 'string'
        ? { providerBasePath: internal.providerBasePath }
        : undefined;
  if (!origin && !literalVars) {
    return undefined;
  }
  return { __promptfoo: { ...origin, ...(literalVars && { literalVars }) } };
}
