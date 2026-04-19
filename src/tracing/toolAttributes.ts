type ToolAttributeFamily = {
  prefix: string;
  nameSuffixes?: readonly string[];
  argSuffixes?: readonly string[];
  extraNameKeys?: readonly string[];
  extraArgKeys?: readonly string[];
};

const TOOL_ATTRIBUTE_FAMILIES: readonly ToolAttributeFamily[] = [
  {
    prefix: 'tool',
    nameSuffixes: ['.name', '_name'],
    argSuffixes: ['.args', '.arguments', '.input', '_args', '_arguments', '_input'],
    extraNameKeys: ['tool'],
  },
  {
    prefix: 'function',
    nameSuffixes: ['.name', '_name'],
    argSuffixes: ['.args', '.arguments', '.input', '_args', '_arguments'],
  },
  {
    prefix: 'ai.toolCall',
    nameSuffixes: ['.name'],
    argSuffixes: ['.args', '.arguments', '.input'],
  },
  {
    prefix: 'gen_ai.tool',
    nameSuffixes: ['.name'],
    argSuffixes: ['.args', '.arguments', '.input'],
    extraArgKeys: ['gen_ai.tool.call.args', 'gen_ai.tool.call.arguments'],
  },
  {
    prefix: 'agent.tool',
    nameSuffixes: ['_name'],
    argSuffixes: ['.args', '.arguments', '.input'],
    extraNameKeys: ['agent.tool', 'agent.toolName'],
  },
  {
    prefix: 'codex.mcp',
    argSuffixes: ['.args', '.arguments', '.input'],
    extraNameKeys: ['codex.mcp.tool'],
  },
];

export const TOOL_NAME_ATTRIBUTE_KEYS: readonly string[] = TOOL_ATTRIBUTE_FAMILIES.flatMap(
  (family) => [
    ...(family.nameSuffixes ?? []).map((suffix) => `${family.prefix}${suffix}`),
    ...(family.extraNameKeys ?? []),
  ],
);

export const TOOL_ARGUMENT_ATTRIBUTE_KEYS: readonly string[] = [
  ...TOOL_ATTRIBUTE_FAMILIES.flatMap((family) => [
    ...(family.argSuffixes ?? []).map((suffix) => `${family.prefix}${suffix}`),
    ...(family.extraArgKeys ?? []),
  ]),
  'args',
  'arguments',
  'input',
];

export function getFirstStringAttribute(
  attributes: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!attributes) {
    return undefined;
  }

  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function getToolNameFromAttributes(
  attributes: Record<string, unknown> | undefined,
): string | undefined {
  return getFirstStringAttribute(attributes, TOOL_NAME_ATTRIBUTE_KEYS);
}
