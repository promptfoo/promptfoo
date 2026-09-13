const TYPE_CHECKS = {
  string: "typeof value === 'string'",
  object: "value !== null && typeof value === 'object' && !Array.isArray(value)",
  array: 'Array.isArray(value)',
  number: "typeof value === 'number' && Number.isFinite(value)",
  integer: 'Number.isInteger(value)',
  boolean: "typeof value === 'boolean'",
  null: 'value === null',
};

// Check declared JSON types, not the full schema (required keys, enums, formats, etc.).
function typeCheck(schema, resolveRef, seen = new Set()) {
  if (schema === false) {
    return 'false';
  }
  if (!schema || typeof schema !== 'object') {
    return 'true';
  }
  const resolved = resolveRef(schema);
  if (seen.has(resolved)) {
    return 'true';
  }
  const active = new Set(seen).add(resolved);
  const checks = [];
  const types = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
  if (types.length > 0 && types.every((type) => Object.hasOwn(TYPE_CHECKS, type))) {
    checks.push(types.map((type) => `(${TYPE_CHECKS[type]})`).join(' || '));
  }
  for (const key of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(resolved[key]) && resolved[key].length > 0) {
      // For unions, accepting any declared type does not assert full oneOf validity.
      checks.push(
        resolved[key]
          .map((branch) => `(${typeCheck(branch, resolveRef, active)})`)
          .join(key === 'allOf' ? ' && ' : ' || '),
      );
    }
  }
  const check = checks.length ? checks.map((part) => `(${part})`).join(' && ') : 'true';
  return resolved.nullable === true ? `value === null || (${check})` : check;
}

export function responseTransform({ field, array, schema, resolveRef }) {
  const base = array ? 'json?.[0]' : 'json';
  const selector = field
    ? /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(field)
      ? `${base}?.${field}`
      : `${base}?.[${JSON.stringify(field)}]`
    : 'json';
  const missingField = field ? `!Object.hasOwn(${base} ?? {}, ${JSON.stringify(field)}) || ` : '';
  const expected = JSON.stringify(
    `Expected response at ${selector} to match its declared JSON type`,
  );
  // Parse root scalars from text: the HTTP transform API coerces falsy data to null.
  return `(json, text) => {
  const value = ${selector === 'json' ? 'JSON.parse(text)' : selector};
  if (${missingField}value === undefined || !(${typeCheck(schema, resolveRef)})) {
    throw new Error(${expected});
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}`;
}

export function smokeAssertions(isJson, expectedText) {
  if (expectedText !== undefined) {
    return [{ type: 'contains', value: expectedText }];
  }
  return [
    {
      type: 'javascript',
      value: isJson
        ? 'output !== null && output !== undefined'
        : "typeof output === 'string' && output.length > 0",
    },
  ];
}
