import { describe, expect, it } from 'vitest';
import { createTransformResponse } from '../../../src/providers/a2a/transforms';

describe('A2A createTransformResponse', () => {
  const finalResponse = {
    events: [{ statusUpdate: { status: { state: 'TASK_STATE_COMPLETED' } } }],
    message: {
      parts: [{ text: 'hello from message' }],
      role: 'ROLE_AGENT',
    },
    raw: {
      message: {
        parts: [{ text: 'hello from message' }],
        role: 'ROLE_AGENT',
      },
    },
    task: {
      id: 'task-1',
      status: { state: 'TASK_STATE_COMPLETED' },
    },
  };

  const context = {
    events: finalResponse.events,
    message: finalResponse.message,
    mode: 'stream' as const,
    raw: finalResponse.raw,
    task: finalResponse.task,
  };

  it('returns extracted text when no transform is configured', async () => {
    const transform = createTransformResponse(undefined);

    await expect(transform(finalResponse, 'fallback text', context)).resolves.toEqual({
      output: 'fallback text',
    });
  });

  it('passes json, text, and context to function transforms', async () => {
    const transform = createTransformResponse((json: any, text: string, transformContext: any) => ({
      metadata: {
        eventCount: transformContext.events.length,
        mode: transformContext.mode,
        taskId: json.task.id,
      },
      output: text.toUpperCase(),
    }));

    await expect(transform(finalResponse, 'fallback text', context)).resolves.toEqual({
      metadata: {
        eventCount: 1,
        mode: 'stream',
        taskId: 'task-1',
      },
      output: 'FALLBACK TEXT',
    });
  });

  it('wraps primitive function transform results as provider output', async () => {
    const transform = createTransformResponse((json: any) => json.task.id);

    await expect(transform(finalResponse, 'fallback text', context)).resolves.toEqual({
      output: 'task-1',
    });
  });

  it('supports string expressions with json and result aliases', async () => {
    const transform = createTransformResponse(
      '({ output: `${json.task.id}:${result.message.role}:${text}:${context.mode}` })',
    );

    await expect(transform(finalResponse, 'fallback text', context)).resolves.toEqual({
      output: 'task-1:ROLE_AGENT:fallback text:stream',
    });
  });

  it('supports async string function expressions', async () => {
    const transform = createTransformResponse('async (json, text) => `${json.task.id}:${text}`');

    await expect(transform(finalResponse, 'fallback text', context)).resolves.toEqual({
      output: 'task-1:fallback text',
    });
  });

  it('wraps object string-expression results without provider response fields', async () => {
    const transform = createTransformResponse('({ taskId: result.task.id })');

    await expect(transform(finalResponse, 'fallback text', context)).resolves.toEqual({
      output: { taskId: 'task-1' },
    });
  });

  it('throws if file transforms are not pre-loaded', () => {
    expect(() => createTransformResponse('file://parser.js')).toThrow(
      /should be pre-loaded before calling createTransformResponse/,
    );
  });

  it('rejects unsupported transform types', () => {
    expect(() => createTransformResponse(123 as any)).toThrow(
      /Unsupported response transform type: number/,
    );
  });

  it('preserves errors from function transforms', async () => {
    const transform = createTransformResponse(() => {
      throw new Error('function transform failed');
    });

    await expect(transform(finalResponse, 'fallback text', context)).rejects.toThrow(
      'function transform failed',
    );
  });

  it('wraps errors from string transforms', async () => {
    const transform = createTransformResponse('result.missing.value');

    await expect(transform(finalResponse, 'fallback text', context)).rejects.toThrow(
      /Failed to transform A2A response/,
    );
  });
});
