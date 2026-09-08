import { describe, expect, it } from 'vitest';
import {
  parseRegistryUrl,
  summarizeSamples,
  validateEvalCommand,
  validateEvalOutput,
} from '../../scripts/measureInstallProfiles';

const sample = (elapsedMs: number, code: number | null = 0, timedOut = false) => ({
  elapsedMs,
  code,
  timedOut,
  signal: null,
  stdout: 'stdout.log',
  stderr: 'stderr.log',
  iteration: 0,
});

const output = (overrides = {}) => ({
  results: {
    results: [
      {
        success: true,
        score: 1,
        failureReason: 0,
        gradingResult: {
          pass: true,
          componentResults: [
            { pass: true, assertion: { type: 'equals', value: 'install profile fixture' } },
          ],
        },
        response: { output: 'install profile fixture' },
        ...overrides,
      },
    ],
  },
});

describe('install profile measurements', () => {
  it.each([
    'https://registry.example/?token=fixture-secret',
    'https://registry.example/#fixture-secret',
    'https://user:fixture-secret@registry.example/',
  ])('rejects credential-bearing registry URLs before recording them', (registry) => {
    expect(() => parseRegistryUrl(registry)).toThrow(
      'Registry URL must not contain credentials, query strings, or fragments',
    );
  });

  it('retains registry paths and rejects non-HTTP registry protocols', () => {
    expect(parseRegistryUrl('https://registry.example/api/npm/').href).toBe(
      'https://registry.example/api/npm/',
    );
    expect(() => parseRegistryUrl('file:///registry')).toThrow('Registry must use http(s)');
  });

  it.each([true, false])(
    'rejects timed-out evals even with the expected exit code: %s',
    (success) => {
      const code = success ? 0 : 100;
      expect(() => validateEvalCommand({ code, timedOut: true }, success)).toThrow('timed out');
      expect(() => validateEvalCommand({ code, timedOut: false }, success)).not.toThrow();
      expect(() => validateEvalCommand({ code: 1, timedOut: false }, success)).toThrow('exit code');
    },
  );

  it('keeps raw failures and first-process timing separate from successful sample statistics', () => {
    const samples = [sample(20, 1), sample(4), sample(100, null, true), sample(2), sample(3)];
    expect(summarizeSamples(samples)).toEqual({
      successful: 3,
      failed: 2,
      firstMs: null,
      medianMs: 3,
      minMs: 2,
      maxMs: 4,
      samples,
    });
  });

  it('averages the middle samples and does not pretend failed probes have timings', () => {
    expect(summarizeSamples([sample(2), sample(4)]).medianMs).toBe(3);
    expect(summarizeSamples([sample(30, 1)]).medianMs).toBeNull();
    expect(summarizeSamples([]).firstMs).toBeNull();
  });

  it('accepts exact passing and intentional assertion-failure exports', () => {
    expect(validateEvalOutput(output(), true)).toHaveLength(1);
    expect(
      validateEvalOutput(
        output({
          success: false,
          score: 0,
          failureReason: 1,
          error: 'Expected mismatch',
          gradingResult: {
            pass: false,
            componentResults: [
              { pass: false, assertion: { type: 'equals', value: 'intentional mismatch' } },
            ],
          },
        }),
        false,
      ),
    ).toHaveLength(1);
  });

  it.each([
    undefined,
    {},
    { results: { results: [] } },
    output({ success: false }),
    output({ score: 0 }),
    output({ error: 'unexpected error' }),
    output({ response: { error: 'transport failure', output: 'install profile fixture' } }),
    output({ response: { output: 'wrong' } }),
  ])('rejects missing or misleading success evidence: %j', (value) => {
    expect(() => validateEvalOutput(value, true)).toThrow();
  });

  it('rejects grading exceptions even when the echo provider succeeded', () => {
    expect(() =>
      validateEvalOutput(
        output({ success: false, score: 0, failureReason: 2, error: 'Assertion grading failed' }),
        false,
      ),
    ).toThrow();
  });

  it('requires assertion failure evidence instead of accepting any failed provider', () => {
    expect(() => validateEvalOutput(output({ success: false, score: 0 }), false)).toThrow();
    expect(() =>
      validateEvalOutput(
        output({ success: false, score: 0, error: 'transport', response: { error: 'transport' } }),
        false,
      ),
    ).toThrow();
  });
});
