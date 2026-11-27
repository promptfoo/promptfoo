type ToolAttributeFamily = {
  prefix: string;
  nameSuffixes?: readonly string[];
  argSuffixes?: readonly string[];
  extraNameKeys?: readonly string[];
  extraArgKeys?: readonly string[];
};

export const COMMAND_ATTRIBUTE_KEYS = [
  'codex.command',
  'command',
  'command.name',
  'command_name',
] as const;

export const SEARCH_ATTRIBUTE_KEYS = [
  'codex.search.query',
  'search.query',
  'search_query',
] as const;

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

/** Normalize imported tool calls to the attributes used by trace filtering and trajectory grading. */
export function getNormalizedToolAttributes(name: string, args?: unknown): Record<string, unknown> {
  return {
    'gen_ai.tool.name': name,
    'tool.name': name,
    ...(args !== undefined && {
      'tool.arguments': typeof args === 'string' ? args : JSON.stringify(args),
    }),
  };
}

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
