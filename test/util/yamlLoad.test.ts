import { describe, expect, it } from 'vitest';
import { loadYaml } from '../../src/util/yamlLoad';

describe('loadYaml', () => {
  it('parses plain YAML documents', () => {
    expect(loadYaml('a: 1\nb: hello')).toEqual({ a: 1, b: 'hello' });
  });

  it('applies YAML merge keys like js-yaml v4', () => {
    const content = [
      'defaults: &defaults',
      '  temperature: 0.5',
      '  max_tokens: 100',
      'provider:',
      '  <<: *defaults',
      '  max_tokens: 200',
    ].join('\n');

    expect(loadYaml(content)).toEqual({
      defaults: { temperature: 0.5, max_tokens: 100 },
      provider: { temperature: 0.5, max_tokens: 200 },
    });
  });

  it('returns undefined for empty input like js-yaml v4', () => {
    expect(loadYaml('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only input', () => {
    expect(loadYaml('   \n\t\n')).toBeUndefined();
  });

  it('returns undefined for comment-only input', () => {
    expect(loadYaml('# just a comment\n# another comment\n')).toBeUndefined();
  });

  it('still throws on invalid YAML', () => {
    expect(() => loadYaml('a: [unclosed')).toThrow();
  });

  it('passes through additional load options', () => {
    expect(() => loadYaml('a: [unclosed', { filename: 'my-config.yaml' })).toThrow(
      /my-config\.yaml/,
    );
  });
});
