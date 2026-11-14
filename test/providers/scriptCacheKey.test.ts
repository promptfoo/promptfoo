import { describe, expect, it } from 'vitest';
import { getScriptInputDigest } from '../../src/providers/scriptResult';

const digestConfig = (config: unknown) =>
  getScriptInputDigest('/provider.py', 'call_api', undefined, ['same', { config }]);

describe('script input fingerprint', () => {
  it('preserves JSON-visible settings and key order', () => {
    const a = { model: 'a', settings: { date: new Date('invalid'), temperature: 0.2 } };
    const b = { model: 'a', settings: { date: null, temperature: 0.2 }, f: () => {} };
    expect(digestConfig(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(digestConfig(a)).toBe(digestConfig(b));
    expect(digestConfig(a)).not.toBe(digestConfig({ settings: b.settings, model: 'a' }));
    expect(digestConfig(a)).not.toBe(digestConfig({ ...b, model: 'b' }));
  });

  it('preserves own __proto__ data in resolved JSON', () => {
    const a = JSON.parse('{"__proto__":{"project":"alpha"}}');
    const b = JSON.parse('{"__proto__":{"project":"beta"}}');
    expect(digestConfig(a)).not.toBe(digestConfig(b));
    expect(digestConfig(a)).not.toBe(digestConfig({}));
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
    expect(digestConfig(input)).toBeUndefined();
  });

  it('checks long local paths as components only at the script and provider base path', () => {
    const basePath =
      '/var/folders/h5/t85nd63d71x27_8gl5gw3l_w0000gn/T/script-result-contract-abcdef';
    const digest = (path: string, prompt = 'same') => {
      const options = { config: { basePath: path } };
      return getScriptInputDigest(`${path}/provider.py`, 'call_api', options, [prompt, options]);
    };
    expect(digest(basePath)).toMatch(/^[a-f0-9]{64}$/);
    expect(digest(`${basePath}/other`)).not.toBe(digest(basePath));
    expect(digest(basePath, basePath)).toBeUndefined();
    expect(digestConfig({ nested: { basePath } })).toBeUndefined();
    expect(digest(`${basePath}/sk-${'x'.repeat(24)}`)).toBeUndefined();
    expect(digest(`${basePath}?api_key=opaque`)).toBeUndefined();
    for (const parent of ['..', '%2e%2e', '.%2E', '..\\ordinary', '.%\t2e', '..\r', '..\n']) {
      const withParent = {
        config: { basePath: `${basePath}/sk-${'x'.repeat(24)}/${parent}/normal` },
      };
      expect(
        getScriptInputDigest('/provider.py', 'call_api', undefined, ['p', withParent]),
      ).toBeUndefined();
    }
    const signed = { config: { basePath: 'https://example.com/storage?api_key=opaque' } };
    const local = { config: { basePath } };
    expect(getScriptInputDigest('/provider.py', 'call_api', signed, ['p', local])).toBeUndefined();
    expect(getScriptInputDigest('/provider.py', 'call_api', local, ['p', signed])).toBeUndefined();
  });

  it('keeps non-secret headers in the fingerprint', () => {
    const digest = (project: string) => digestConfig({ headers: { 'OpenAI-Project': project } });
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
