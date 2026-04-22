import { describe, expect, it } from 'vitest';
import {
  getToolNameFromAttributes,
  TOOL_ARGUMENT_ATTRIBUTE_KEYS,
  TOOL_NAME_ATTRIBUTE_KEYS,
} from '../../src/tracing/toolAttributes';

describe('getToolNameFromAttributes', () => {
  it('returns undefined when attributes are missing', () => {
    expect(getToolNameFromAttributes(undefined)).toBeUndefined();
  });

  it('returns undefined when no recognized keys are present', () => {
    expect(getToolNameFromAttributes({ foo: 'bar' })).toBeUndefined();
  });

  it('returns Vercel AI SDK tool span names', () => {
    expect(
      getToolNameFromAttributes({
        'ai.toolCall.name': 'lookup_customer',
      }),
    ).toBe('lookup_customer');
  });

  it('prefers generic tool.name over vendor-specific keys', () => {
    expect(
      getToolNameFromAttributes({
        'tool.name': 'search_orders',
        'ai.toolCall.name': 'lookup_customer',
      }),
    ).toBe('search_orders');
  });

  it('recognizes function.name', () => {
    expect(
      getToolNameFromAttributes({
        'function.name': 'compose_reply',
      }),
    ).toBe('compose_reply');
  });

  it('trims whitespace from values', () => {
    expect(
      getToolNameFromAttributes({
        'tool.name': '  trimmed_tool  ',
      }),
    ).toBe('trimmed_tool');
  });

  it('skips empty string values in favor of later recognized keys', () => {
    expect(
      getToolNameFromAttributes({
        'tool.name': '   ',
        'ai.toolCall.name': 'fallback_tool',
      }),
    ).toBe('fallback_tool');
  });

  it('skips non-string values', () => {
    expect(
      getToolNameFromAttributes({
        'tool.name': 42,
        'ai.toolCall.name': 'fallback_tool',
      }),
    ).toBe('fallback_tool');
  });

  it('does not match arbitrary attributes whose keys are not in the allowlist', () => {
    expect(
      getToolNameFromAttributes({
        'workflow.tool': 'should_not_match',
        'tool.description': 'not a tool name',
      }),
    ).toBeUndefined();
  });
});

describe('tool attribute key tables', () => {
  it('exposes the expected set of tool-name keys', () => {
    expect([...TOOL_NAME_ATTRIBUTE_KEYS].sort()).toEqual([
      'agent.tool',
      'agent.toolName',
      'agent.tool_name',
      'ai.toolCall.name',
      'codex.mcp.tool',
      'function.name',
      'function_name',
      'gen_ai.tool.name',
      'tool',
      'tool.name',
      'tool_name',
    ]);
  });

  it('exposes the expected set of tool-argument keys', () => {
    expect([...TOOL_ARGUMENT_ATTRIBUTE_KEYS].sort()).toEqual([
      'agent.tool.args',
      'agent.tool.arguments',
      'agent.tool.input',
      'ai.toolCall.args',
      'ai.toolCall.arguments',
      'ai.toolCall.input',
      'args',
      'arguments',
      'codex.mcp.args',
      'codex.mcp.arguments',
      'codex.mcp.input',
      'function.args',
      'function.arguments',
      'function.input',
      'function_args',
      'function_arguments',
      'gen_ai.tool.args',
      'gen_ai.tool.arguments',
      'gen_ai.tool.call.args',
      'gen_ai.tool.call.arguments',
      'gen_ai.tool.input',
      'input',
      'tool.args',
      'tool.arguments',
      'tool.input',
      'tool_args',
      'tool_arguments',
      'tool_input',
    ]);
  });

  it('has no duplicate keys in either table', () => {
    expect(new Set(TOOL_NAME_ATTRIBUTE_KEYS).size).toBe(TOOL_NAME_ATTRIBUTE_KEYS.length);
    expect(new Set(TOOL_ARGUMENT_ATTRIBUTE_KEYS).size).toBe(TOOL_ARGUMENT_ATTRIBUTE_KEYS.length);
  });
});
