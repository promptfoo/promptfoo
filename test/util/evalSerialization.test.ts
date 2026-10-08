import { describe, expect, it, vi } from 'vitest';
import { LlamaApiProvider } from '../../src/providers/llamaApi';
import { OpenClawToolInvokeProvider } from '../../src/providers/openclaw/tools';
import { projectConfigForOutput, serializeEvalValue } from '../../src/util/evalSerialization';

const payload = {
  password: 'fixture password',
  token: 'test-token',
  secret: 'the hidden word',
  session: 'session-one',
  headers: { 'X-Fixture': 'keep me', Authorization: 'fixture authorization' },
  hash: 'a'.repeat(128),
  url: 'https://example.com/test?token=fixture&sig=fixture signature',
  json: '{ "password": "fixture",  "number": 1 }\n',
  nested: { a: { b: { c: { d: { e: { secret: 'deep fixture' } } } } } },
};

describe('local eval serialization', () => {
  it('preserves JSON data and opaque strings without mutating the input', () => {
    const saved = serializeEvalValue(payload);
    expect(saved).toEqual(payload);
    saved.headers.Authorization = 'changed copy';
    expect(payload.headers.Authorization).toBe('fixture authorization');
  });

  it('projects shared, nested runtime providers and excludes SDK clients', () => {
    const provider = {
      id: () => 'custom-provider',
      label: 'Judge',
      callApi: async () => ({ output: 'ok' }),
      config: { apiKey: 'configured credential', body: payload },
      env: { CUSTOM_TOKEN: 'configured environment' },
      sdk: { apiKey: 'implicit runtime credential' },
    };
    const input = {
      options: { provider: { text: provider, embedding: provider } },
      assert: [{ type: 'assert-set', assert: [{ type: 'llm-rubric', provider }] }],
    };
    const saved = serializeEvalValue(input);
    const expected = {
      id: 'custom-provider',
      label: 'Judge',
      config: provider.config,
      env: provider.env,
    };
    expect(saved.options.provider.text).toEqual(expected);
    expect(saved.options.provider.embedding).toEqual(expected);
    expect(saved.assert[0].assert[0].provider).toEqual(expected);
    expect(JSON.stringify(saved)).not.toContain('implicit runtime credential');
    expect(provider.sdk.apiKey).toBe('implicit runtime credential');
  });

  it('snapshots providers with custom toJSON methods and preserves ordinary JSON conversion', () => {
    const llama = new LlamaApiProvider('test-model', { config: { apiKey: 'fixture-key' } });
    const openclaw = new OpenClawToolInvokeProvider('sessions_list');
    const date = new Date('2026-01-01T00:00:00Z');
    const input = { nested: { providers: [llama, openclaw] }, date };
    expect(serializeEvalValue(input)).toEqual({
      nested: {
        providers: [{ id: llama.id(), config: llama.config }, { id: openclaw.id() }],
      },
      date: date.toISOString(),
    });
    expect(serializeEvalValue(llama)).toEqual({
      id: llama.id(),
      config: llama.config,
    });
    expect(llama.config.apiKey).toBe('fixture-key');
  });

  it('keeps SDK clients out of the oversized-value serialization fallback', () => {
    const provider = {
      id: () => 'custom-provider',
      callApi: async () => ({ output: 'ok' }),
      config: { apiKey: 'configured credential' },
      sdk: { apiKey: 'implicit runtime credential' },
    };
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
      throw new RangeError('Invalid string length');
    });
    try {
      expect(serializeEvalValue({ provider })).toEqual({
        provider: { id: 'custom-provider', config: provider.config },
      });
    } finally {
      stringify.mockRestore();
    }
  });

  it('never invokes provider toJSON, including nested, shared, and circular providers', () => {
    const toJSON = vi.fn(() => {
      throw new Error('Provider serialization must use its configuration');
    });
    const provider = {
      id: () => 'custom',
      callApi: async () => ({ output: 'ok' }),
      config: { apiKey: 'fixture-key', self: undefined as unknown },
      toJSON,
    };
    provider.config.self = provider;
    const expected = { id: 'custom', config: { apiKey: 'fixture-key' } };
    expect(serializeEvalValue(provider)).toEqual(expected);
    expect(serializeEvalValue({ providers: [provider], nested: { provider }, payload })).toEqual({
      providers: [expected],
      nested: { provider: expected },
      payload,
    });
    expect(toJSON).not.toHaveBeenCalled();
    expect(provider.config.self).toBe(provider);
  });

  it('preserves native JSON conversions and data keys while projecting converted containers', () => {
    const provider = {
      id: () => 'custom',
      callApi: async () => ({ output: 'ok' }),
      toJSON: () => {
        throw new Error('Must not run');
      },
    };
    class CustomValue {
      #value = 'private field';
      toJSON(key: string) {
        return { value: this.#value, key, provider };
      }
    }
    const input = {
      buffer: Buffer.from('hello'),
      custom: new CustomValue(),
      data: JSON.parse('{"__proto__":{"password":"fixture"}}'),
      primitive: Object(7),
    };
    expect(serializeEvalValue(input)).toEqual({
      buffer: { type: 'Buffer', data: [104, 101, 108, 108, 111] },
      custom: { value: 'private field', key: 'custom', provider: { id: 'custom' } },
      data: input.data,
      primitive: 7,
    });
  });

  it('serializes arrays by index even when their methods are shadowed by data', () => {
    const output = Object.assign(['first', 'second'], { map: 'fixture metadata' });
    expect(serializeEvalValue({ output })).toEqual({ output: ['first', 'second'] });
  });

  it('preserves per-occurrence toJSON results that reuse and mutate a shared object', () => {
    const converted: Record<string, string> = {};
    const keyed = {
      toJSON(key: string) {
        delete converted.first;
        converted[key] = key;
        return converted;
      },
    };
    expect(serializeEvalValue({ first: keyed, second: keyed })).toEqual({
      first: { first: 'first' },
      second: { second: 'second' },
    });
  });

  it('handles circular providers without dropping shared non-circular data', () => {
    const provider = {
      id: () => 'custom',
      callApi: async () => ({ output: 'ok' }),
      config: { payload, self: undefined as unknown },
    };
    provider.config.self = provider;
    const saved = serializeEvalValue({ first: provider, second: provider, payload });
    expect(saved.first).toEqual({ id: 'custom', config: { payload } });
    expect(saved.second).toEqual(saved.first);
    expect(saved.payload).toEqual(payload);
  });

  it('preserves local config values unless their exclusion is explicitly requested', () => {
    const config = {
      prompts: [payload.json],
      env: { CUSTOM_TOKEN: 'configured environment' },
      defaultTest: { vars: payload },
      tests: [
        { vars: payload, metadata: { secret: 'fixture metadata' }, providerOutput: payload.json },
      ],
      scenarios: [{ config: [{ vars: payload }], tests: [{ vars: payload }] }],
    };
    expect(projectConfigForOutput(config)).toEqual(config);
    const stripped = projectConfigForOutput(config, {
      shouldStripPromptText: true,
      shouldStripTestVars: true,
      shouldStripMetadata: true,
      shouldStripResponseOutput: true,
    });
    expect(stripped).toEqual({
      env: config.env,
      defaultTest: {},
      tests: [{}],
      scenarios: [{ config: [{}], tests: [{}] }],
    });
    expect(config.tests[0].vars).toEqual(payload);
  });
});
