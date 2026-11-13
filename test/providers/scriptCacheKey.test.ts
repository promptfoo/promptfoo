import { describe, expect, it } from 'vitest';
import {
  isScriptResolvedConfigCacheable,
  scriptResolvedConfigCacheKey,
} from '../../src/util/scriptConfigCacheKey';
import { scriptVisibleContextCacheKey } from '../../src/util/scriptContextCacheKey';

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

  it('does not treat a file-backed secret-only change as a distinct cache identity', () => {
    const original = {
      basePath: '/tmp/eval',
      settings: 'file://config/model_settings.json',
    };
    const accountA = {
      basePath: '/tmp/eval',
      settings: { model: 'gpt-test', apiKey: secret },
    };
    const accountB = {
      basePath: '/tmp/eval',
      settings: { apiKey: 'sk-other-account-secret-value-0123456789', model: 'gpt-test' },
    };
    const noSecret = {
      basePath: '/tmp/eval',
      settings: { model: 'gpt-test', temperature: 0.2 },
    };
    const inline = {
      model: 'gpt-test',
      apiKey: secret,
    };

    expect(scriptResolvedConfigCacheKey(accountA)).toBe(scriptResolvedConfigCacheKey(accountB));
    expect(scriptResolvedConfigCacheKey(accountA)).not.toContain(secret);
    expect(isScriptResolvedConfigCacheable(accountA, original)).toBe(false);
    expect(isScriptResolvedConfigCacheable(accountB, original)).toBe(false);
    expect(isScriptResolvedConfigCacheable(noSecret, original)).toBe(true);
    expect(isScriptResolvedConfigCacheable(inline, inline)).toBe(true);
    expect(
      isScriptResolvedConfigCacheable(
        { apiKey: 'not-a-credential-shape' },
        { apiKey: 'file://config/api_key.txt' },
      ),
    ).toBe(false);
    expect(
      isScriptResolvedConfigCacheable(
        { env: { OPENAI_API_KEY: secret, MODEL: 'gpt-test' } },
        { env: 'file://config/env.json' },
      ),
    ).toBe(false);
  });
});

describe('scriptVisibleContextCacheKey', () => {
  const prompt = { id: 'prompt-1', raw: 'Hello {{name}}', label: 'greeting' };

  it('ignores metadata key order and per-run tracing ids', () => {
    const first = scriptVisibleContextCacheKey({
      prompt,
      test: {
        metadata: {
          pluginId: 'harmful',
          strategyId: 'basic',
          evaluationId: 'eval-run-1',
          traceparent: '00-aaa-bbb-01',
          __evalId: 'eval-run-1',
        },
      },
    });
    const reordered = scriptVisibleContextCacheKey({
      prompt: { label: 'greeting', raw: 'Hello {{name}}', id: 'prompt-1' },
      test: {
        metadata: {
          traceparent: '00-ccc-ddd-01',
          strategyId: 'basic',
          evaluationId: 'eval-run-2',
          pluginId: 'harmful',
        },
      },
    });

    expect(reordered).toBe(first);
    expect(first).not.toContain('eval-run-1');
    expect(first).not.toContain('harmful');
  });

  it('keeps trace-like field names in user-defined nested metadata', () => {
    const fingerprint = (traceId: string) =>
      scriptVisibleContextCacheKey({ prompt, test: { metadata: { pluginConfig: { traceId } } } });

    expect(fingerprint('tenant-a')).not.toBe(fingerprint('tenant-b'));
  });

  it('keeps script-visible own __proto__ data in cache keys', () => {
    const metadata = JSON.parse('{"__proto__": {"project": "alpha"}}');
    const withData = scriptVisibleContextCacheKey({ prompt, test: { metadata } });
    expect(withData).not.toBe(scriptVisibleContextCacheKey({ prompt, test: { metadata: {} } }));
  });

  it('changes when script-visible metadata or the prompt changes', () => {
    const base = scriptVisibleContextCacheKey({
      prompt,
      test: { metadata: { pluginId: 'harmful', strategyId: 'basic', pluginConfig: { goal: 'a' } } },
    });
    const otherPlugin = scriptVisibleContextCacheKey({
      prompt,
      test: { metadata: { strategyId: 'basic', pluginId: 'pii', pluginConfig: { goal: 'a' } } },
    });
    const otherGoal = scriptVisibleContextCacheKey({
      prompt,
      test: { metadata: { pluginId: 'harmful', strategyId: 'basic', pluginConfig: { goal: 'b' } } },
    });
    const otherLabel = scriptVisibleContextCacheKey({
      prompt: { ...prompt, label: 'other' },
      test: { metadata: { pluginId: 'harmful', strategyId: 'basic', pluginConfig: { goal: 'a' } } },
    });
    const withFunction = scriptVisibleContextCacheKey({
      prompt: { ...prompt, function: () => 'unused' },
      test: { metadata: { pluginId: 'harmful', strategyId: 'basic', pluginConfig: { goal: 'a' } } },
    });

    expect(otherPlugin).not.toBe(base);
    expect(otherGoal).not.toBe(base);
    expect(otherLabel).not.toBe(base);
    expect(withFunction).toBe(base);
  });
});
