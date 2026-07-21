import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { loadYaml } from './yaml';

describe('loadYaml', () => {
  it('preserves js-yaml v4 merge and empty-document behavior', () => {
    expect(loadYaml('base: &base { enabled: true }\nvalue: { <<: *base }')).toEqual({
      base: { enabled: true },
      value: { enabled: true },
    });
    expect(loadYaml('# comment only')).toBeUndefined();
  });

  it('preserves js-yaml v4 legacy standard tags', () => {
    expect(loadYaml('!!binary SGVsbG8=')).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    expect(loadYaml('2024-01-02')).toEqual(new Date('2024-01-02T00:00:00.000Z'));
    expect(loadYaml('!!omap [{a: 1}, {b: 2}]')).toEqual([{ a: 1 }, { b: 2 }]);
    expect(loadYaml('!!pairs [{a: 1}, {b: 2}]')).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(loadYaml('!!set {a: null, b: null}')).toEqual({ a: null, b: null });
    expect(() => loadYaml('!!set {a: not-null}')).toThrow(/cannot resolve a set item/);
  });

  it('supports large and Map-backed ordered maps while rejecting duplicate keys', () => {
    const entries = Array.from({ length: 2048 }, (_, index) => `{key${index}: ${index}}`);
    expect(loadYaml(`!!omap [${entries.join(', ')}]`)).toHaveLength(2048);

    const schema = yaml.CORE_SCHEMA.withTags(yaml.omapTag, yaml.realMapTag);
    expect(loadYaml('!!omap [{a: 1}, {b: 2}]', { schema })).toEqual([
      new Map([['a', 1]]),
      new Map([['b', 2]]),
    ]);
    expect(() => loadYaml('!!omap [{a: 1}, {a: 2}]', { schema })).toThrow(
      /duplicate key in ordered map/,
    );
  });
});
