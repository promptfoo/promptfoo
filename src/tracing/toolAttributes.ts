const TOOL_NAME_ATTRIBUTE_KEYS = [
  'tool.name',
  'tool_name',
  'ai.toolCall.name',
  'tool',
  'function.name',
  'function_name',
  'gen_ai.tool.name',
  'codex.mcp.tool',
  'agent.tool',
  'agent.tool_name',
  'agent.toolName',
] as const;

export function getToolNameFromAttributes(
  attributes: Record<string, unknown> | undefined,
): string | undefined {
  if (!attributes) {
    return undefined;
  }

  for (const key of TOOL_NAME_ATTRIBUTE_KEYS) {
    const value = attributes[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}
