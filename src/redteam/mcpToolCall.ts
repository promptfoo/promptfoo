import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import type { MCPTool } from '../providers/mcp/types';

export type McpToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

const TOOL_NAME_FIELDS = ['tool', 'toolName', 'function', 'functionName', 'name'] as const;
const TOOL_ARGS_FIELDS = ['args', 'arguments', 'params', 'parameters'] as const;

const ajv = new Ajv({ allErrors: true, strictSchema: false });
addFormats(ajv);

export function parseMcpToolCall(
  value: unknown,
  allowedToolNames: Set<string>,
): McpToolCall | undefined {
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

export function validateMcpToolCall(
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
  } catch {
    return false;
  }
}

export function normalizeMcpToolCall(value: unknown, tools: MCPTool[]): McpToolCall | undefined {
  const allowedToolNames = new Set(tools.map((tool) => tool.name));
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
  const toolCall = parseMcpToolCall(value, allowedToolNames);

  return validateMcpToolCall(toolCall, toolByName) ? toolCall : undefined;
}

export function stringifyMcpToolCall(toolCall: McpToolCall): string {
  return JSON.stringify({
    tool: toolCall.tool,
    args: toolCall.args,
  });
}
