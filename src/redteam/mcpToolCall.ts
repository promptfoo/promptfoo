import { isDeepStrictEqual } from 'node:util';

import Ajv from 'ajv';
import Ajv2019 from 'ajv/dist/2019.js';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export type McpToolDefinition = {
  name: string;
  inputSchema?: Record<string, unknown>;
};

export type McpToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

const TOOL_NAME_FIELDS = ['tool', 'toolName', 'function', 'functionName', 'name'] as const;
const TOOL_ARGS_FIELDS = ['args', 'arguments', 'params', 'parameters'] as const;

const ajv = new Ajv({ allErrors: true, strictSchema: false, addUsedSchema: false });
addFormats(ajv);
const ajv2019 = new Ajv2019({ allErrors: true, strictSchema: false, addUsedSchema: false });
addFormats(ajv2019);
const ajv2020 = new Ajv2020({ allErrors: true, strictSchema: false, addUsedSchema: false });
addFormats(ajv2020);

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
  let toolName: string | undefined;
  for (const field of TOOL_NAME_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      continue;
    }
    const value = record[field];
    if (
      typeof value !== 'string' ||
      !allowedToolNames.has(value) ||
      (toolName !== undefined && toolName !== value)
    ) {
      return undefined;
    }
    toolName = value;
  }

  if (!toolName) {
    return undefined;
  }

  let rawArgs: Record<string, unknown> | undefined;
  for (const field of TOOL_ARGS_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      continue;
    }
    const value = record[field];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }
    if (rawArgs !== undefined && !isDeepStrictEqual(rawArgs, value)) {
      return undefined;
    }
    rawArgs = value as Record<string, unknown>;
  }

  return {
    tool: toolName,
    args: rawArgs ?? {},
  };
}

export function validateMcpToolCall(
  toolCall: McpToolCall | undefined,
  toolByName: Map<string, McpToolDefinition>,
): boolean {
  if (!toolCall) {
    return false;
  }

  const tool = toolByName.get(toolCall.tool);
  if (!tool) {
    return false;
  }

  try {
    const schema = tool.inputSchema ?? { type: 'object' };
    const dialect =
      typeof schema.$schema === 'string' ? schema.$schema.replace(/#$/, '') : undefined;
    const validator =
      dialect === 'https://json-schema.org/draft/2020-12/schema'
        ? ajv2020
        : dialect === 'https://json-schema.org/draft/2019-09/schema'
          ? ajv2019
          : ajv;
    return validator.validate(schema, toolCall.args) === true;
  } catch {
    return false;
  }
}

export function normalizeMcpToolCall(
  value: unknown,
  tools: McpToolDefinition[],
): McpToolCall | undefined {
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
