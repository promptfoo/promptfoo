import { isDeepStrictEqual } from 'node:util';

import logger from '../../logger';
import { MCPProvider } from '../../providers/mcp/index';

import type { MCPTool } from '../../providers/mcp/types';
import type { ApiProvider } from '../../types/index';

function schemaKey(schema: unknown): string {
  return (
    JSON.stringify(schema, (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, value[key]]),
          )
        : value,
    ) ?? ''
  );
}

// Only traverse schema positions: arrays inside enum/const/default are literal values.
function normalizeSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema;
  }
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => {
      if ((key === 'required' || key === 'type') && Array.isArray(value)) {
        return [key, [...value].sort()];
      }
      if (
        [
          'properties',
          'patternProperties',
          '$defs',
          'definitions',
          'dependentSchemas',
          'dependentRequired',
          'dependencies',
        ].includes(key) &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        return [
          key,
          Object.fromEntries(
            Object.entries(value).map(([name, child]) => [
              name,
              (key === 'dependentRequired' || key === 'dependencies') && Array.isArray(child)
                ? [...child].sort()
                : normalizeSchema(child),
            ]),
          ),
        ];
      }
      if (
        [
          'items',
          'prefixItems',
          'allOf',
          'anyOf',
          'oneOf',
          'additionalItems',
          'additionalProperties',
          'unevaluatedItems',
          'unevaluatedProperties',
          'contains',
          'propertyNames',
          'not',
          'if',
          'then',
          'else',
        ].includes(key)
      ) {
        const normalized = Array.isArray(value)
          ? value.map(normalizeSchema)
          : normalizeSchema(value);
        if (['allOf', 'anyOf', 'oneOf'].includes(key) && Array.isArray(normalized)) {
          normalized.sort((a, b) => {
            const left = schemaKey(a),
              right = schemaKey(b);
            return left < right ? -1 : left > right ? 1 : 0;
          });
        }
        return [key, normalized];
      }
      return [key, value];
    }),
  );
}

export async function extractMcpTools(providers: ApiProvider[]): Promise<MCPTool[]> {
  const tools = new Map<string, { tool: MCPTool; providerId: string }>();

  for (const provider of providers) {
    if (!(provider instanceof MCPProvider)) {
      continue;
    }
    let availableTools: MCPTool[];
    try {
      availableTools = await provider.getAvailableTools();
    } catch (error) {
      logger.warn(
        `Failed to get tools from MCP provider: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    for (const tool of availableTools) {
      const existing = tools.get(tool.name);
      if (
        existing &&
        !isDeepStrictEqual(
          normalizeSchema(existing.tool.inputSchema),
          normalizeSchema(tool.inputSchema),
        )
      ) {
        throw new Error(
          `MCP tool "${tool.name}" has conflicting input schemas in providers "${existing.providerId}" and "${provider.id()}". Run separate redteams for these targets or use distinct tool names.`,
        );
      }
      if (!existing) {
        tools.set(tool.name, { tool, providerId: provider.id() });
      }
    }
  }

  return [...tools.values()].map(({ tool }) => tool);
}

export async function extractMcpToolsInfo(providers: ApiProvider[]): Promise<string> {
  const tools = await extractMcpTools(providers);
  return tools.length
    ? '\nAvailable MCP tools:\n' + tools.map((tool) => JSON.stringify(tool)).join('\n')
    : '';
}
