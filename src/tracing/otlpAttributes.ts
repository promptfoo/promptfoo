export function parseOtlpAttributes(attributes: unknown, decoded = false): Record<string, unknown> {
  if (attributes === undefined) {
    return {};
  }
  if (!Array.isArray(attributes)) {
    throw new SyntaxError('Invalid OTLP payload: attributes must be an array');
  }
  if (attributes.some((attribute) => attribute == null || typeof attribute.key !== 'string')) {
    throw new SyntaxError('Invalid OTLP payload: attribute keys must be strings');
  }
  if (new Set(attributes.map(({ key }) => key)).size !== attributes.length) {
    throw new SyntaxError('Invalid OTLP payload: duplicate attribute keys');
  }
  return Object.fromEntries(
    attributes.map((attribute) => [
      attribute.key,
      parseOtlpAttributeValue(attribute.value, decoded),
    ]),
  );
}

export function parseOtlpAttributeValue(value: unknown, decoded = false): unknown {
  const invalid = () => new SyntaxError('Invalid OTLP payload: malformed attribute value');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid();
  }
  const record = value as Record<string, unknown>;
  const fields = Object.keys(record).filter((key) => record[key] !== undefined);
  if (fields.length === 0) {
    // Empty AnyValue is valid OTLP. Preserve its presence as unknown evidence.
    return null;
  }
  if (fields.length !== 1) {
    throw invalid();
  }
  const field = fields[0];
  const content = record[field];
  switch (field) {
    case 'stringValue':
      if (typeof content !== 'string') {
        throw invalid();
      }
      return content;
    case 'bytesValue':
      if (decoded) {
        if (!(content instanceof Uint8Array)) {
          throw invalid();
        }
        return Buffer.from(content).toString('base64');
      }
      if (typeof content !== 'string') {
        throw invalid();
      }
      return content;
    case 'intValue': {
      if (
        typeof content !== 'string' &&
        typeof content !== 'number' &&
        !(decoded && content && typeof content === 'object' && !Array.isArray(content))
      ) {
        throw invalid();
      }
      const text = String(content);
      if (!/^-?\d+$/.test(text)) {
        throw invalid();
      }
      const number = Number(text);
      return Number.isSafeInteger(number) ? number : text;
    }
    case 'doubleValue':
      if (typeof content !== 'number' || !Number.isFinite(content)) {
        throw invalid();
      }
      return content;
    case 'boolValue':
      if (typeof content !== 'boolean') {
        throw invalid();
      }
      return content;
    case 'arrayValue':
    case 'kvlistValue': {
      if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw invalid();
      }
      const values = (content as { values?: unknown }).values;
      if (values !== undefined && !Array.isArray(values)) {
        throw invalid();
      }
      return field === 'kvlistValue'
        ? parseOtlpAttributes(values ?? [], decoded)
        : (values ?? []).map((entry: unknown) => parseOtlpAttributeValue(entry, decoded));
    }
    default:
      throw invalid();
  }
}
