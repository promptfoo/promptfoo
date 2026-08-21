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

  it('does not read inherited values from YAML mapping tags', () => {
    const mapping = Object.create({ inherited: 'prototype value' }) as Record<string, unknown>;
    mapping.own = 'own value';

    for (const tag of [yaml.mapTag, yaml.legacyMapTag]) {
      expect(tag.get(mapping, 'inherited')).toBeNull();
      expect(tag.get(mapping, 'own')).toBe('own value');
    }
  });

  it('preserves timestamps from the first century', () => {
    expect(loadYaml('0001-01-01')).toEqual(new Date('0001-01-01T00:00:00.000Z'));
    expect(loadYaml('0050-06-15T12:30:00Z')).toEqual(new Date('0050-06-15T12:30:00.000Z'));
    expect(loadYaml('0001-02-29')).toBe('0001-02-29');
  });

  it('preserves implicit null values before a document end marker', () => {
    expect(loadYaml('optional:\n...\n')).toEqual({ optional: null });
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
