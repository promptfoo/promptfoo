import { describe, expect, it, vi } from 'vitest';
import {
  buildConfiguredProviderMap,
  GRADING_PROVIDER_TYPE_KEYS,
  isProviderTypeMap,
  resolveConfiguredProviderReference,
} from '../../src/util/gradingProvider';

import type { ApiProvider } from '../../src/types/providers';

function makeProvider(id: string, label?: string): ApiProvider {
  return {
    id: vi.fn().mockReturnValue(id),
    label,
    callApi: vi.fn().mockResolvedValue({ output: '' }),
  };
}

describe('GRADING_PROVIDER_TYPE_KEYS', () => {
  it('lists the four supported grading-provider types', () => {
    expect([...GRADING_PROVIDER_TYPE_KEYS]).toEqual([
      'text',
      'embedding',
      'classification',
      'moderation',
    ]);
  });
});

describe('isProviderTypeMap', () => {
  it.each([
    ['null', null, false],
    ['undefined', undefined, false],
    ['string', 'litellm:judge', false],
    ['array', ['litellm:judge'], false],
    ['empty object', {}, false],
    ['ProviderOptions (has id)', { id: 'litellm:judge', config: {} }, false],
    [
      'ApiProvider instance',
      { id: () => 'x', callApi: () => Promise.resolve({ output: '' }) },
      false,
    ],
    ['ProviderOptionsMap (unknown key)', { 'litellm:judge': { config: {} } }, false],
    ['ProviderOptionsMap (type-named key)', { text: { config: {} } }, false],
    ['type key with undefined value', { text: undefined }, false],
  ])('returns false for %s', (_label, value, expected) => {
    expect(isProviderTypeMap(value)).toBe(expected);
  });

  it.each([
    ['text', { text: 'litellm:judge' }],
    ['text ProviderOptions', { text: { id: 'litellm:judge', config: {} } }],
    ['embedding', { embedding: 'litellm:embed' }],
    ['classification', { classification: 'classifier' }],
    ['moderation', { moderation: 'moderator' }],
    ['multiple', { text: 'litellm:judge', embedding: 'litellm:embed' }],
  ])('returns true for typed map (%s)', (_label, value) => {
    expect(isProviderTypeMap(value)).toBe(true);
  });
});

describe('buildConfiguredProviderMap', () => {
  it('returns a null-prototype map', () => {
    const map = buildConfiguredProviderMap([makeProvider('a')]);
    expect(Object.getPrototypeOf(map)).toBeNull();
  });

  it('indexes providers by id and label', () => {
    const provider = makeProvider('openai:gpt-4', 'gpt');
    const map = buildConfiguredProviderMap([provider]);
    expect(map['openai:gpt-4']).toBe(provider);
    expect(map.gpt).toBe(provider);
  });

  it('does not let a later provider label shadow an earlier provider id', () => {
    const byId = makeProvider('judge');
    const byLabel = makeProvider('litellm:judge', 'judge');
    const map = buildConfiguredProviderMap([byId, byLabel]);
    expect(map.judge).toBe(byId);
    expect(map['litellm:judge']).toBe(byLabel);
  });

  it('is independent of provider iteration order for id/label collisions', () => {
    const byId = makeProvider('judge');
    const byLabel = makeProvider('litellm:judge', 'judge');
    const reverse = buildConfiguredProviderMap([byLabel, byId]);
    expect(reverse.judge).toBe(byId);
    expect(reverse['litellm:judge']).toBe(byLabel);
  });

  it('still applies a label alias when no id collides', () => {
    const provider = makeProvider('litellm:judge', 'judge');
    const map = buildConfiguredProviderMap([provider]);
    expect(map.judge).toBe(provider);
    expect(map['litellm:judge']).toBe(provider);
  });

  it('does not surface prototype properties through hasOwn lookups', () => {
    const map = buildConfiguredProviderMap([makeProvider('a')]);
    expect(Object.hasOwn(map, '__proto__')).toBe(false);
    expect(Object.hasOwn(map, 'constructor')).toBe(false);
    expect(Object.hasOwn(map, 'toString')).toBe(false);
  });

  it('returns an empty null-prototype map for an empty input', () => {
    const map = buildConfiguredProviderMap([]);
    expect(Object.getPrototypeOf(map)).toBeNull();
    expect(Object.keys(map)).toEqual([]);
  });
});

describe('resolveConfiguredProviderReference', () => {
  it('resolves configured typed entries while leaving unconfigured alternatives lazy', () => {
    const textProvider = makeProvider('litellm:judge');
    const providerMap = buildConfiguredProviderMap([textProvider]);

    expect(
      resolveConfiguredProviderReference(
        { text: 'litellm:judge', embedding: 'unsupported-provider:unused-embedding' },
        providerMap,
      ),
    ).toEqual({
      text: textProvider,
      embedding: 'unsupported-provider:unused-embedding',
    });
  });
});
