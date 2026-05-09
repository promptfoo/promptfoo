import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import dedent from 'dedent';
import logger from '../logger';
import { extractJsonObjects } from '../util/json';

import type { MCPTool } from '../providers/mcp/types';
import type { ApiProvider, TokenUsage } from '../types/index';

type McpToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

type TrackedMcpMaterialization = {
  value: string;
  tokenUsage?: TokenUsage;
};

type RepairedMcpToolCall = {
  toolCall?: McpToolCall;
  tokenUsage?: TokenUsage;
};

export class McpMaterializationError extends Error {
  constructor(
    message: string,
    readonly tokenUsage?: TokenUsage,
  ) {
    super(message);
    this.name = 'McpMaterializationError';
  }
}

const TOOL_NAME_FIELDS = ['tool', 'toolName', 'function', 'functionName', 'name'] as const;
const TOOL_ARGS_FIELDS = ['args', 'arguments', 'params', 'parameters'] as const;

const ajv = new Ajv({ allErrors: true, strictSchema: false });
addFormats(ajv);

function parseMcpToolCall(value: unknown, allowedToolNames: Set<string>): McpToolCall | undefined {
  let parsed = value;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;
  const toolName = TOOL_NAME_FIELDS.map((field) => record[field]).find(
    (fieldValue): fieldValue is string =>
      typeof fieldValue === 'string' && allowedToolNames.has(fieldValue),
  );

  if (!toolName) {
    return undefined;
  }

  const rawArgs =
    TOOL_ARGS_FIELDS.map((field) => record[field]).find(
      (fieldValue) =>
        typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue),
    ) ?? {};

  return {
    tool: toolName,
    args: rawArgs as Record<string, unknown>,
  };
}

function validateMcpToolCall(
  toolCall: McpToolCall | undefined,
  toolByName: Map<string, MCPTool>,
): boolean {
  if (!toolCall) {
    return false;
  }

  const tool = toolByName.get(toolCall.tool);
  if (!tool) {
    return false;
  }

  try {
    return ajv.validate(tool.inputSchema ?? { type: 'object' }, toolCall.args) === true;
  } catch (error) {
    logger.warn(
      `Failed to validate MCP tool call for ${tool.name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

function stringifyToolCall(toolCall: McpToolCall): string {
  return JSON.stringify({
    tool: toolCall.tool,
    args: toolCall.args,
  });
}

function getProviderOutputString(response: Awaited<ReturnType<ApiProvider['callApi']>>): string {
  if (Array.isArray(response.output)) {
    return response.output.join('\n');
  }
  return response.output === undefined ? '' : String(response.output);
}

async function repairMcpToolCallWithProvider({
  allowedToolNames,
  purpose,
  provider,
  toolByName,
  tools,
  value,
}: {
  allowedToolNames: Set<string>;
  purpose: string;
  provider: ApiProvider;
  toolByName: Map<string, MCPTool>;
  tools: MCPTool[];
  value: unknown;
}): Promise<RepairedMcpToolCall> {
  let response: Awaited<ReturnType<ApiProvider['callApi']>>;
  try {
    response = await provider.callApi(
      dedent`
        Convert this red team test intent into exactly one MCP tool call JSON object.

        Return JSON only, with this exact shape:
        {"tool":"tool_name","args":{}}

        Choose only one of these MCP tools and use its input schema:
        ${JSON.stringify(tools, null, 2)}

        Application purpose:
        ${purpose}

        Red team test intent:
        ${typeof value === 'string' ? value : JSON.stringify(value)}
      `.trim(),
    );
  } catch (error) {
    logger.debug(
      `Failed to repair MCP value with provider: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {};
  }

  if (response.error) {
    logger.warn(`Failed to materialize MCP value: ${response.error}`);
    return { tokenUsage: response.tokenUsage };
  }

  const output = getProviderOutputString(response);
  const parsedObjects = extractJsonObjects(output);

  for (const parsedObject of parsedObjects) {
    const toolCall = parseMcpToolCall(parsedObject, allowedToolNames);
    if (validateMcpToolCall(toolCall, toolByName)) {
      return {
        toolCall,
        tokenUsage: response.tokenUsage,
      };
    }
  }

  return { tokenUsage: response.tokenUsage };
}

export async function materializeTrackedMcpValue({
  intentValue,
  purpose,
  provider,
  tools,
  value,
}: {
  intentValue?: unknown;
  purpose?: string;
  provider?: ApiProvider;
  tools: MCPTool[];
  value: unknown;
}): Promise<TrackedMcpMaterialization> {
  if (tools.length === 0) {
    return {
      value: typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value),
    };
  }

  const allowedToolNames = new Set(tools.map((tool) => tool.name));
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
  const existingToolCall = parseMcpToolCall(value, allowedToolNames);

  if (existingToolCall && validateMcpToolCall(existingToolCall, toolByName)) {
    return { value: stringifyToolCall(existingToolCall) };
  }

  const materializationIntentValue = intentValue ?? value;
  if (!provider) {
    throw new McpMaterializationError(
      `Failed to materialize MCP value: inference provider is required for non-JSON MCP input ${JSON.stringify(
        value,
      )}`,
    );
  }

  const repaired = await repairMcpToolCallWithProvider({
    allowedToolNames,
    provider,
    purpose: purpose ?? '',
    toolByName,
    tools,
    value: materializationIntentValue,
  });

  if (!repaired.toolCall || !validateMcpToolCall(repaired.toolCall, toolByName)) {
    throw new McpMaterializationError(
      `Failed to materialize MCP value: ${JSON.stringify(value)}`,
      repaired.tokenUsage,
    );
  }

  return {
    value: stringifyToolCall(repaired.toolCall),
    ...(repaired.tokenUsage ? { tokenUsage: repaired.tokenUsage } : {}),
  };
}

export async function materializeMcpValue(
  params: Parameters<typeof materializeTrackedMcpValue>[0],
): Promise<string> {
  return (await materializeTrackedMcpValue(params)).value;
}
