import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, useStore } from './evalConfig';

describe('evalConfig store', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.getState().reset();
  });

  it('initializes with the default configuration', () => {
    expect(useStore.getState().config).toEqual(DEFAULT_CONFIG);
  });

  it('merges updates into the current configuration', () => {
    useStore.getState().updateConfig({
      description: 'Test evaluation',
      providers: [{ id: 'openai:gpt-4' }],
    });

    expect(useStore.getState().config).toMatchObject({
      description: 'Test evaluation',
      providers: [{ id: 'openai:gpt-4' }],
      prompts: [],
    });
  });

  it('replaces the configuration without restoring omitted defaults', () => {
    const config = { description: 'Replacement', prompts: ['Hello'] };

    useStore.getState().setConfig(config);

    expect(useStore.getState().config).toEqual(config);
    expect(useStore.getState().config.env).toBeUndefined();
  });

  it('resets the configuration to its defaults', () => {
    useStore.getState().updateConfig({ description: 'Modified' });

    useStore.getState().reset();

    expect(useStore.getState().config).toEqual(DEFAULT_CONFIG);
  });

  it('keeps credentials in memory without persisting evaluation drafts', () => {
    const config = {
      env: { OPENAI_API_KEY: 'session-only-key' },
      providers: [
        {
          id: 'openai:gpt-4o',
          config: {
            apiKey: 'provider-secret',
            headers: { Authorization: 'Bearer temporary-token' },
          },
        },
      ],
    };

    useStore.getState().updateConfig(config);

    expect(useStore.getState().config).toMatchObject(config);
    expect(localStorage.getItem('promptfoo')).toBeNull();
  });

  it('preserves supported default test configurations', () => {
    useStore.getState().updateConfig({ defaultTest: 'file://default.yaml' });
    expect(useStore.getState().getTestSuite().defaultTest).toBe('file://default.yaml');

    const defaultTest = {
      assert: [{ type: 'equals' as const, value: 'expected' }],
      vars: { input: 'value' },
    };
    useStore.getState().updateConfig({ defaultTest });

    expect(useStore.getState().getTestSuite().defaultTest).toEqual(defaultTest);
  });

  it('returns the expected test suite fields', () => {
    const config = {
      description: 'My evaluation',
      env: { API_KEY: 'temporary-key' },
      extensions: ['file://extension.ts'],
      prompts: ['Hello {{name}}'],
      providers: [{ id: 'echo' }],
      scenarios: [],
      tests: [{ vars: { name: 'World' } }],
      evaluateOptions: { maxConcurrency: 2 },
      derivedMetrics: [{ name: 'precision', value: 'tp / (tp + fp)' }],
    };

    useStore.getState().updateConfig(config);

    expect(useStore.getState().getTestSuite()).toMatchObject(config);
  });

  it('uses an empty test list when the configuration omits tests', () => {
    useStore.getState().setConfig({ prompts: ['Hello'] });

    expect(useStore.getState().getTestSuite().tests).toEqual([]);
  });
});
