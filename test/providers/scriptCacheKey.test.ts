import { describe, expect, it } from 'vitest';
import { scriptResolvedConfigCacheKey } from '../../src/util/scriptConfigCacheKey';

describe('scriptResolvedConfigCacheKey', () => {
  const secret = 'sk-test-secret-value-0123456789abcdef';

  it('ignores object key order and secret values', () => {
    const forward = {
      settings: {
        temperature: 0.2,
        model: 'gpt-test',
        apiKey: secret,
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        env: { OPENAI_API_KEY: secret, MODEL: 'gpt-test' },
      },
    };
    const reversed = {
      settings: {
        env: { MODEL: 'gpt-test', OPENAI_API_KEY: 'sk-different-secret-value-0123456789' },
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer rotated-token' },
        apiKey: 'sk-another-secret-value-0123456789abcd',
        model: 'gpt-test',
        temperature: 0.2,
      },
    };

    const key = scriptResolvedConfigCacheKey(forward);
    expect(key).toBe(scriptResolvedConfigCacheKey(reversed));
    expect(key).not.toContain(secret);
    expect(key).not.toContain('rotated-token');
    expect(key).not.toContain('sk-another-secret-value-0123456789abcd');
  });

  it('changes when a non-secret resolved setting changes', () => {
    const base = {
      basePath: '/tmp/eval',
      settings: 'file://config/model_settings.json',
    };
    const resolved = {
      basePath: '/tmp/eval',
      settings: {
        temperature: 0.2,
        model: 'gpt-test',
        apiKey: secret,
      },
    };
    const updated = {
      basePath: '/tmp/eval',
      settings: {
        model: 'gpt-test',
        temperature: 0.9,
        apiKey: 'sk-rotated-secret-value-0123456789abcdef',
      },
    };

    const unresolvedKey = scriptResolvedConfigCacheKey(base);
    const resolvedKey = scriptResolvedConfigCacheKey(resolved);
    const updatedKey = scriptResolvedConfigCacheKey(updated);

    expect(resolvedKey).not.toBe(unresolvedKey);
    expect(updatedKey).not.toBe(resolvedKey);
    expect(resolvedKey).not.toContain(secret);
    expect(updatedKey).not.toContain('file://config/model_settings.json');
  });

  it('keeps non-secret headers and prompts in the fingerprint', () => {
    const prompt = 'a'.repeat(80);
    const withPrompt = scriptResolvedConfigCacheKey({
      settings: { system: prompt, headers: { 'Content-Type': 'application/json' } },
    });
    const changedPrompt = scriptResolvedConfigCacheKey({
      settings: { system: `${prompt}!`, headers: { 'Content-Type': 'application/json' } },
    });
    const changedHeader = scriptResolvedConfigCacheKey({
      settings: { headers: { 'Content-Type': 'text/plain' }, system: prompt },
    });

    expect(changedPrompt).not.toBe(withPrompt);
    expect(changedHeader).not.toBe(withPrompt);
    expect(withPrompt).not.toContain(prompt);
  });
});
