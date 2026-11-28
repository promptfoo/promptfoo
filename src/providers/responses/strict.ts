/** Resolve the effective Responses JSON schema strict flag after template rendering. */
export function resolveResponseSchemaStrict(
  nested: unknown,
  flat: unknown,
  renderEnv?: (value: string) => string,
): boolean {
  const value = nested ?? flat ?? true;
  // Context variables have already been rendered. An explicit renderer handles direct calls
  // without interpreting template syntax introduced by a runtime value.
  const strict = renderEnv && typeof value === 'string' ? renderEnv(value) : value;
  if (typeof strict === 'boolean') {
    return strict;
  }
  if (strict === 'true' || strict === 'false') {
    return strict === 'true';
  }
  throw new Error('Responses JSON schema strict must be a boolean');
}
