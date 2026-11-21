import { GRADING_PROVIDER_TYPE_KEYS, isProviderTypeMap } from './gradingProvider';

/** Browser-safe decoding shared by requests and exported provider configurations. */
export function decodeBedrockBase64(value: string): Uint8Array {
  try {
    const binary = atob(value);
    const canonical = btoa(binary);
    if (value === canonical || value === canonical.replace(/=+$/, '')) {
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }
  } catch {
    // Preserve the same error for malformed encodings and noncanonical padding.
  }
  throw new Error('Invalid Bedrock byte content: expected canonical base64.');
}

const AGENT_BLOB_PATHS = [
  ['sessionState', 'files', '[]', 'source', 'byteContent', 'data'],
  ...['functionResult', 'apiResult'].map((result) => [
    'sessionState',
    'returnControlInvocationResults',
    '[]',
    result,
    'responseBody',
    '{}',
    'images',
    '[]',
    'source',
    'bytes',
  ]),
];
const KNOWLEDGE_BASE_BLOB_PATH = [
  'retrieveAndGenerateConfiguration',
  'externalSourcesConfiguration',
  'sources',
  '[]',
  'byteContent',
  'data',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function serializeBlobPath(value: unknown, path: readonly string[]): unknown {
  if (path.length === 0) {
    if (typeof value === 'string') {
      try {
        // Use the already-supported Buffer JSON shape; generic secret sanitation
        // must still examine every neighboring field in this configuration.
        return { type: 'Buffer', data: Array.from(decodeBedrockBase64(value)) };
      } catch {
        // References, templates, and invalid input keep their existing output behavior.
      }
    }
    return value;
  }
  const [key, ...rest] = path;
  if (key === '[]') {
    return Array.isArray(value) ? value.map((item) => serializeBlobPath(item, rest)) : value;
  }
  if (!isRecord(value)) {
    return value;
  }
  if (key === '{}') {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, serializeBlobPath(item, rest)]),
    );
  }
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    return value;
  }
  const projected = serializeBlobPath(value[key], rest);
  return projected === value[key] ? value : { ...value, [key]: projected };
}

function serializeOptions(options: unknown, id: string): unknown {
  const paths = /^(?:bedrock-agent:|bedrock:agents(?::|$))/.test(id)
    ? AGENT_BLOB_PATHS
    : /^bedrock:(?:kb|knowledge-base)(?::|$)/.test(id)
      ? [KNOWLEDGE_BASE_BLOB_PATH]
      : [];
  if (!isRecord(options) || !isRecord(options.config) || paths.length === 0) {
    return options;
  }
  const config = paths.reduce<unknown>(serializeBlobPath, options.config);
  return config === options.config ? options : { ...options, config };
}

/** Snapshot only declared Bedrock blobs in known provider slots, without loading providers. */
export function serializeBedrockProviderRef<T>(provider: T): T {
  if (Array.isArray(provider)) {
    return provider.map(serializeBedrockProviderRef) as T;
  }
  if (!isRecord(provider) || typeof provider.id === 'function') {
    return provider;
  }
  if (typeof provider.id === 'string') {
    return serializeOptions(provider, provider.id) as T;
  }
  if (isProviderTypeMap(provider)) {
    return {
      ...provider,
      ...Object.fromEntries(
        GRADING_PROVIDER_TYPE_KEYS.filter((key) =>
          Object.prototype.hasOwnProperty.call(provider, key),
        ).map((key) => [key, serializeBedrockProviderRef(provider[key])]),
      ),
    };
  }
  // ProviderOptionsMap keeps the routing ID as its key, even when options override id.
  return Object.fromEntries(
    Object.entries(provider).map(([id, options]) => [id, serializeOptions(options, id)]),
  ) as T;
}
