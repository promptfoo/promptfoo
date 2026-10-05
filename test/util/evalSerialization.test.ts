import { describe, expect, it, vi } from 'vitest';
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
