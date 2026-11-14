import { describe, expect, it } from 'vitest';
import { getScriptInputDigest } from '../../src/providers/scriptResult';
import { scriptInputDigest } from '../../src/util/scriptConfigCacheKey';

describe('script input fingerprint', () => {
  it('preserves JSON-visible settings and key order', () => {
    const a = { model: 'a', settings: { date: new Date('invalid'), temperature: 0.2 } };
    const b = { model: 'a', settings: { date: null, temperature: 0.2 }, f: () => {} };
    expect(scriptInputDigest(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(scriptInputDigest(a)).toBe(scriptInputDigest(b));
    expect(scriptInputDigest(a)).not.toBe(scriptInputDigest({ settings: b.settings, model: 'a' }));
    expect(scriptInputDigest(a)).not.toBe(scriptInputDigest({ ...b, model: 'b' }));
  });

  it('preserves own __proto__ data in resolved JSON', () => {
    const a = JSON.parse('{"__proto__":{"project":"alpha"}}');
    const b = JSON.parse('{"__proto__":{"project":"beta"}}');
    expect(scriptInputDigest(a)).not.toBe(scriptInputDigest(b));
    expect(scriptInputDigest(a)).not.toBe(scriptInputDigest({}));
  });

  it.each([
    { env: { OPENAI_API_KEY: 'short' } },
    { headers: { 'X-Custom-Gateway': 'opaque' } },
    { labels: ['https://user:pass@example.com/a'] },
    { metadata: { endpoint: 'https://example.com/a?api_key=opaque' } },
    { prompt: { config: { Authorization: 'short' } } },
    { greeting: 'Bearer short' },
    { payload: 'token=short&metric=alpha' },
    { prompt: '{"headers":{"X-Custom-Gateway":"opaque"}}' },
  ])('bypasses the cache when inputs carry credentials', (input) => {
    expect(scriptInputDigest(input)).toBeUndefined();
  });

  it('keeps non-secret headers in the fingerprint', () => {
    const digest = (project: string) =>
      scriptInputDigest({ headers: { 'OpenAI-Project': project } });
    expect(digest('alpha')).toBeDefined();
    expect(digest('alpha')).not.toBe(digest('beta'));
  });

  it('retains authored metadata, description and the input passed to the worker', () => {
    const context = {
      prompt: { raw: 'Hello', label: 'prompt' },
      vars: { __evalId: 'run-a', __evalStepId: 'step' },
      evaluationId: 'run-a',
      traceparent: 'generated',
      test: {
        description: 'greeting',
        metadata: { tracingEnabled: true, evaluationId: 'run-a', traceId: 'tenant-a' },
      },
    };
    const digest = (ctx: typeof context) =>
      getScriptInputDigest('/provider.py', 'call_api', undefined, ['same', { config: {} }, ctx]);
    const first = digest(context);
    expect(first).toBeDefined();
    expect(
      digest({
        ...context,
        evaluationId: 'run-b',
        traceparent: 'fresh',
        vars: { ...context.vars, __evalId: 'run-b' },
        test: { ...context.test, metadata: { ...context.test.metadata, evaluationId: 'run-b' } },
      }),
    ).toBe(first);
    expect(
      digest({ ...context, test: { ...context.test, description: 'other description' } }),
    ).not.toBe(first);
    expect(
      digest({
        ...context,
        test: { ...context.test, metadata: { ...context.test.metadata, traceId: 'tenant-b' } },
      }),
    ).not.toBe(first);
    expect(digest({ ...context, evaluationId: 'authored' })).not.toBe(first);
    expect(context.test.metadata.evaluationId).toBe('run-a');
    expect(context.vars.__evalId).toBe('run-a');
  });
});
