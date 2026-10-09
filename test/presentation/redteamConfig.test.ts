import { describe, expect, it } from 'vitest';
import { normalizeRedteamConfigForPreview } from '../../src/presentation/redteamConfig';
import { Severity } from '../../src/redteam/constants';

// The preview must count the same expanded plugins as generation, even while users edit fields.
describe('redteam workload preview normalization', () => {
  it('expands aliases and retains their per-plugin count, severity, and language', () => {
    const plugin = Object.freeze({
      id: 'toxicity',
      numTests: 2,
      severity: Severity.Critical,
      config: { language: 'fr' },
    });
    const result = normalizeRedteamConfigForPreview({
      plugins: [plugin],
      strategies: ['basic'],
      numTests: 7,
      language: ['en', 'es'],
    });
    expect(result.plugins).toHaveLength(6);
    expect(result.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'harmful:hate',
          numTests: 2,
          severity: Severity.Critical,
          config: { language: 'fr' },
        }),
      ]),
    );
    for (const entry of result.plugins) {
      expect(entry).toMatchObject({
        numTests: 2,
        severity: Severity.Critical,
        config: { language: 'fr' },
      });
    }
    expect(plugin.id).toBe('toxicity');
    expect(result.numTests).toBe(7);
    expect(result.language).toEqual(['en', 'es']);
  });

  it('applies the last count for identical plugin configurations and keeps distinct configs', () => {
    const result = normalizeRedteamConfigForPreview({
      plugins: [
        { id: 'contracts', numTests: 500, config: { language: 'fr' } },
        { id: 'contracts', numTests: 7, config: { language: 'fr' } },
        { id: 'contracts', numTests: 3, config: { language: 'de' } },
      ],
      strategies: [],
    });
    expect(result.plugins).toHaveLength(2);
    expect(result.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'contracts', numTests: 7, config: { language: 'fr' } }),
        expect.objectContaining({ id: 'contracts', numTests: 3, config: { language: 'de' } }),
      ]),
    );
    expect(result.numTests).toBe(5);
  });

  it.each([0, -2, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'uses the global count for invalid override %s',
    (numTests) => {
      const result = normalizeRedteamConfigForPreview({
        plugins: ['bola', { id: 'bfla', numTests }],
        strategies: ['basic'],
        numTests: 9,
      });
      expect(result.plugins).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'bola', numTests: 9 }),
          expect.objectContaining({ id: 'bfla', numTests: 9 }),
        ]),
      );
    },
  );

  it('keeps a non-mutating best-effort preview for incomplete editor fields', () => {
    const plugin = Object.freeze({ id: '', numTests: -1, severity: Severity.High });
    const result = normalizeRedteamConfigForPreview({
      plugins: [plugin],
      strategies: [],
      language: 'en',
    });
    expect(result).toEqual({
      plugins: [{ id: '', severity: Severity.High }],
      strategies: [],
      numTests: 5,
      language: 'en',
    });
    expect(plugin.numTests).toBe(-1);
  });

  it('keeps an empty selection empty', () => {
    const result = normalizeRedteamConfigForPreview({ plugins: [], strategies: [], numTests: 5 });
    expect(result.plugins).toEqual([]);
    expect(result.strategies).toEqual([]);
  });
});
