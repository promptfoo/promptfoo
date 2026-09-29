import { describe, expect, it } from 'vitest';
import {
  INVALID_FULL_CONFIG_YAML_MESSAGE,
  isFullYamlConfig,
  validateYamlConfigDraft,
} from './yamlConfigValidation';

describe('validateYamlConfigDraft', () => {
  it('validates the fields in an incomplete draft without applying defaults or removing keys', () => {
    const draft = {
      tracing: { otlp: { http: {} } },
      extensions: null,
      customDraftField: 'preserved',
    };

    const result = validateYamlConfigDraft(draft);

    expect(result).toEqual({ success: true, config: draft });
    if (result.success) {
      expect(result.config).toBe(draft);
      expect(result.config.tracing).not.toHaveProperty('enabled');
    }
    expect(validateYamlConfigDraft({ description: 'draft' }).success).toBe(true);
  });

  it('reports the path of an invalid runtime input without echoing its value', () => {
    const result = validateYamlConfigDraft({ tracing: { enabled: 'incorrect-value' } });

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('tracing.enabled'),
    });
    if (!result.success) {
      expect(result.error).not.toContain('incorrect-value');
    }
  });

  it('rejects a caller-supplied base directory and explains how to run local references', () => {
    const result = validateYamlConfigDraft({
      basePath: '/work/private-directory',
      prompts: ['file://prompt.txt'],
    });

    expect(result).toEqual({ success: false, error: expect.stringContaining('basePath') });
    if (!result.success) {
      expect(result.error).toContain('CLI');
      expect(result.error).not.toContain('/work/private-directory');
    }
  });

  it('allows either provider spelling or neither, but rejects both', () => {
    expect(validateYamlConfigDraft({}).success).toBe(true);
    expect(validateYamlConfigDraft({ providers: ['echo'] })).toEqual({
      success: true,
      config: { providers: ['echo'] },
    });
    const withTargets = { targets: ['echo'] };
    expect(validateYamlConfigDraft(withTargets)).toEqual({
      success: true,
      config: { providers: ['echo'] },
    });
    expect(withTargets).toEqual({ targets: ['echo'] });
    expect(validateYamlConfigDraft({ providers: ['echo'], targets: ['echo'] })).toEqual({
      success: false,
      error: expect.stringContaining('not both'),
    });
  });

  it.each([null, undefined, 42, ['not a config']])('rejects non-object drafts', (value) => {
    expect(validateYamlConfigDraft(value)).toEqual({
      success: false,
      error: 'Invalid YAML configuration',
    });
  });
});

describe('isFullYamlConfig', () => {
  it('rejects null, undefined, primitives, and arrays', () => {
    expect(isFullYamlConfig(null)).toBe(false);
    expect(isFullYamlConfig(undefined)).toBe(false);
    expect(isFullYamlConfig('providers: []')).toBe(false);
    expect(isFullYamlConfig(42)).toBe(false);
    expect(isFullYamlConfig([{ vars: { x: 1 } }])).toBe(false);
  });

  it('rejects minimal single test case shapes', () => {
    expect(isFullYamlConfig({ vars: { animal: 'penguin' } })).toBe(false);
    expect(isFullYamlConfig({ assert: [{ type: 'contains', value: 'safe' }] })).toBe(false);
    expect(isFullYamlConfig({ vars: {}, assert: [], options: {} })).toBe(false);
  });

  it('rejects individual test cases that use non-vars test fields', () => {
    expect(
      isFullYamlConfig({
        provider: 'echo',
        prompts: ['Greeting prompt'],
        threshold: 0.8,
      }),
    ).toBe(false);
  });

  it('rejects prompt-only test filters rather than treating them as a full config', () => {
    expect(isFullYamlConfig({ prompts: ['Greeting prompt'] })).toBe(false);
  });

  it('rejects a single test case that includes both provider and prompt filters', () => {
    expect(
      isFullYamlConfig({
        providers: ['openai:gpt-4.1'],
        prompts: ['Greeting prompt'],
        vars: { topic: 'reliability' },
      }),
    ).toBe(false);
  });

  it('accepts full configurations and ambiguous objects with full-config keys', () => {
    expect(isFullYamlConfig({ providers: ['echo'], prompts: ['hello'], tests: [] })).toBe(true);
    expect(isFullYamlConfig({ tests: [{ vars: { a: 1 } }] })).toBe(true);
    expect(isFullYamlConfig({ redteam: { plugins: [] } })).toBe(true);
    expect(isFullYamlConfig({ vars: { a: 1 }, tests: [] })).toBe(true);
  });

  it('exports a stable error message', () => {
    expect(INVALID_FULL_CONFIG_YAML_MESSAGE).toMatch(/full configuration/i);
  });
});
