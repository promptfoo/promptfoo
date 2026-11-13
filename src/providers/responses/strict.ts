/** Resolve the effective Responses JSON schema strict flag after template rendering. */
export function resolveResponseSchemaStrict(nested: unknown, flat: unknown): boolean {
  const strict = nested ?? flat ?? true;
  if (typeof strict === 'boolean') {
    return strict;
  }
  if (strict === 'true' || strict === 'false') {
    return strict === 'true';
  }
  throw new Error('Responses JSON schema strict must be a boolean');
}
