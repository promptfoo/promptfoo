import { describe, expect, it } from 'vitest';
import { createTransformResponse } from '../../../src/providers/mcp/transforms';

describe('MCP createTransformResponse', () => {
  const context = {
    toolName: 'lookup_user',
    toolArgs: { id: '123' },
    originalPayload: { tool: 'lookup_user', args: { id: '123' } },
  };

  it('should return normalized content when no transform is configured', async () => {
    const transform = createTransformResponse(undefined);

    await expect(
      transform({ structuredContent: { name: 'Ada' } }, 'fallback text', context),
    ).resolves.toEqual({
      output: 'fallback text',
    });
  });

  it('should expose raw result, normalized content, and context to string transforms', async () => {
    const transform = createTransformResponse(
      '({ output: result.structuredContent.name, metadata: { tool: context.toolName, content } })',
    );

    await expect(
      transform({ structuredContent: { name: 'Ada' } }, 'fallback text', context),
    ).resolves.toEqual({
      output: 'Ada',
      metadata: {
        tool: 'lookup_user',
        content: 'fallback text',
      },
    });
  });

  it('should wrap primitive function results as provider output', async () => {
    const transform = createTransformResponse((result: any) => result.structuredContent.name);

    await expect(
      transform({ structuredContent: { name: 'Ada' } }, 'fallback text', context),
    ).resolves.toEqual({
      output: 'Ada',
    });
  });

  it('should wrap primitive string-expression results as provider output', async () => {
    const transform = createTransformResponse('42');

    await expect(transform({}, 'fallback text', context)).resolves.toEqual({
      output: 42,
    });
  });

  it('should await async function results before normalizing them', async () => {
    const transform = createTransformResponse(async (result: any) => result.structuredContent.name);

    await expect(
      transform({ structuredContent: { name: 'Ada' } }, 'fallback text', context),
    ).resolves.toEqual({
      output: 'Ada',
    });
  });

  it('should await async string function expressions before normalizing them', async () => {
    const transform = createTransformResponse('async (result) => result.structuredContent.name');

    await expect(
      transform({ structuredContent: { name: 'Ada' } }, 'fallback text', context),
    ).resolves.toEqual({
      output: 'Ada',
    });
  });

  it('should wrap object results without provider response fields as output', async () => {
    const transform = createTransformResponse('({ answer: result.structuredContent.name })');

    await expect(
      transform({ structuredContent: { name: 'Ada' } }, 'fallback text', context),
    ).resolves.toEqual({
      output: { answer: 'Ada' },
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

  it('should wrap errors from string transforms', async () => {
    const transform = createTransformResponse('result.missing.value');

    await expect(transform({}, 'fallback text', context)).rejects.toThrow(
      /Failed to transform MCP response/,
    );
  });
});
