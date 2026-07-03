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
  });
});
