import { describe, expect, it } from 'vitest';
import { INVALID_FULL_CONFIG_YAML_MESSAGE, isFullYamlConfig } from './yamlConfigValidation';

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
