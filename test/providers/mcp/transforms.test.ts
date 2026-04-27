import { describe, expect, it } from 'vitest';
import { createTransformResponse } from '../../../src/providers/mcp/transforms';

describe('MCP createTransformResponse', () => {
  const context = {
    toolName: 'lookup_user',
    toolArgs: { id: '123' },
    originalPayload: { tool: 'lookup_user', args: { id: '123' } },
  };

  it('should return normalized content when no transform is configured', () => {
    const transform = createTransformResponse(undefined);

    expect(transform({ structuredContent: { name: 'Ada' } }, 'fallback text', context)).toEqual({
      output: 'fallback text',
    });
  });

  it('should expose raw result, normalized content, and context to string transforms', () => {
    const transform = createTransformResponse(
      '({ output: result.structuredContent.name, metadata: { tool: context.toolName, content } })',
    );

    expect(transform({ structuredContent: { name: 'Ada' } }, 'fallback text', context)).toEqual({
      output: 'Ada',
      metadata: {
        tool: 'lookup_user',
        content: 'fallback text',
      },
    });
  });

  it('should wrap primitive function results as provider output', () => {
    const transform = createTransformResponse((result: any) => result.structuredContent.name);

    expect(transform({ structuredContent: { name: 'Ada' } }, 'fallback text', context)).toEqual({
      output: 'Ada',
    });
  });

  it('should throw if file transforms are not pre-loaded', () => {
    expect(() => createTransformResponse('file://parser.js')).toThrow(
      /should be pre-loaded before calling createTransformResponse/,
    );
  });

  it('should reject unsupported transform types', () => {
    expect(() => createTransformResponse(123 as any)).toThrow(
      "Unsupported response transform type: number. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.",
    );
  });

  it('should wrap errors from string transforms', () => {
    const transform = createTransformResponse('result.missing.value');

    expect(() => transform({}, 'fallback text', context)).toThrow(
      /Failed to transform MCP response/,
    );
  });
});
