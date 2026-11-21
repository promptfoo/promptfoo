import { createHash } from 'node:crypto';
import type {
  JsonSchema,
  McpServerContract,
  McpToolDefinition,
  NormalizedToolContract,
} from './types';

/**
 * Computes a deterministic SHA-256 hex digest of any string.
 */
export function computeSha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Recursively canonicalizes a JSON Schema or arbitrary JS value:
 * 1. Object keys are sorted alphabetically.
 * 2. Arrays in `required` are sorted alphabetically and deduplicated.
 * 3. Arrays in `enum` are sorted deterministically and deduplicated.
 * 4. Empty arrays for `required` are omitted.
 * 5. Undefined values are omitted cleanly.
 */
export function canonicalizeValue(val: unknown): unknown {
  if (val === null || typeof val !== 'object') {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => canonicalizeValue(item));
  }

  const record = val as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const canonicalObj: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    const propVal = record[key];
    if (propVal === undefined) {
      continue;
    }

    if (key === 'required' && Array.isArray(propVal)) {
      const sortedRequired = Array.from(
        new Set(
          propVal
            .filter((item): item is string => typeof item === 'string')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ).sort();

      if (sortedRequired.length > 0) {
        canonicalObj[key] = sortedRequired;
      }
      continue;
    }

    if (key === 'enum' && Array.isArray(propVal)) {
      const sortedEnum = Array.from(new Set(propVal)).sort((a, b) => {
        const strA = JSON.stringify(a);
        const strB = JSON.stringify(b);
        return strA.localeCompare(strB);
      });
      canonicalObj[key] = sortedEnum;
      continue;
    }

    canonicalObj[key] = canonicalizeValue(propVal);
  }

  return canonicalObj;
}

/**
 * Normalizes a raw JSON Schema into canonical format.
 */
export function normalizeJsonSchema(schema: JsonSchema = {}): JsonSchema {
  const canonical = canonicalizeValue(schema) as JsonSchema;
  // Ensure default type 'object' if properties exist but type is unspecified
  if (canonical.properties && !canonical.type) {
    canonical.type = 'object';
  }
  return canonical;
}

/**
 * Normalizes a single MCP tool definition and computes its deterministic SHA-256 fingerprints.
 */
export function normalizeTool(tool: McpToolDefinition): NormalizedToolContract {
  const name = (tool.name || '').trim();
  const description = (tool.description || '').trim();
  const canonicalSchema = normalizeJsonSchema(tool.inputSchema || {});

  const canonicalSchemaString = JSON.stringify(canonicalSchema);
  const schemaFingerprint = computeSha256(canonicalSchemaString);

  const fullDefinitionPayload = JSON.stringify({
    name,
    description,
    inputSchema: canonicalSchema,
  });
  const fullFingerprint = computeSha256(fullDefinitionPayload);

  return {
    name,
    description,
    canonicalSchema,
    rawSchema: tool.inputSchema || {},
    schemaFingerprint,
    fullFingerprint,
  };
}

/**
 * Assembles a complete McpServerContract from discovered tools and computes
 * the deterministic server-level SHA-256 fingerprint.
 */
export function buildServerContract(
  serverId: string,
  tools: McpToolDefinition[],
  metadata?: Record<string, unknown>,
): McpServerContract {
  const sortedTools = [...tools].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const normalizedToolsMap: Record<string, NormalizedToolContract> = {};

  const compositeFingerprintBuffer: string[] = [];

  for (const tool of sortedTools) {
    const normalized = normalizeTool(tool);
    normalizedToolsMap[normalized.name] = normalized;
    compositeFingerprintBuffer.push(`${normalized.name}:${normalized.fullFingerprint}`);
  }

  const overallFingerprint = computeSha256(compositeFingerprintBuffer.join('|'));

  return {
    serverId,
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    overallFingerprint,
    toolCount: sortedTools.length,
    tools: normalizedToolsMap,
    metadata,
  };
}

