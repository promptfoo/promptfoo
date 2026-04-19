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

const BARE_ARG_KEYS = ['args', 'arguments', 'input'] as const;

function buildFamilyKeys(kind: 'name' | 'arg'): readonly string[] {
  const keys: string[] = [];
  for (const family of TOOL_ATTRIBUTE_FAMILIES) {
    const suffixes = kind === 'name' ? family.nameSuffixes : family.argSuffixes;
    if (suffixes) {
      for (const suffix of suffixes) {
        keys.push(`${family.prefix}${suffix}`);
      }
    }
    const extras = kind === 'name' ? family.extraNameKeys : family.extraArgKeys;
    if (extras) {
      keys.push(...extras);
    }
  }
  return keys;
}

export const TOOL_NAME_ATTRIBUTE_KEYS: readonly string[] = buildFamilyKeys('name');

export const TOOL_ARGUMENT_ATTRIBUTE_KEYS: readonly string[] = [
  ...buildFamilyKeys('arg'),
  ...BARE_ARG_KEYS,
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
