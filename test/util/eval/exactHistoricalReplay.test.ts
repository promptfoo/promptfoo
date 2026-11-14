import { describe, expect, it, vi } from 'vitest';
import {
  assertUnambiguousHistoricalProviders,
  createExactHistoricalReplayPlan,
  restoreExactHistoricalReplayCases,
  validateExactHistoricalReplayPlan,
} from '../../../src/models/evalResult';

import type { PreparedHistoricalCandidate } from '../../../src/types/internal';

describe('prepared exact historical replay', () => {
  it('rejects indistinguishable distinct live targets while allowing a shared instance', () => {
    const target = () => ({
      id: () => 'same-id',
      label: 'same-label',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    });
    const first = target();
    const second = target();
    const candidates: PreparedHistoricalCandidate[] = [first, second].map(
      (provider, testIndex) => ({
        source: { kind: 'top-level', testIndex },
        test: { vars: { testIndex }, provider },
      }),
    );
    expect(() => assertUnambiguousHistoricalProviders(candidates)).toThrow(
      'distinct providers with the same id and label',
    );
    expect(() =>
      assertUnambiguousHistoricalProviders([
        candidates[0],
        { ...candidates[1], test: { ...candidates[1].test, provider: first } },
      ]),
    ).not.toThrow();
    expect(first.callApi).not.toHaveBeenCalled();
    expect(second.callApi).not.toHaveBeenCalled();
  });

  it('stores scalar current cases without executable transforms and restores the live provider', () => {
    const provider = {
      id: vi.fn(() => 'local:current'),
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };
    const candidate: PreparedHistoricalCandidate = {
      source: { kind: 'scenario', scenarioIndex: 0, variantIndex: 0, testIndex: 0 },
      test: {
        vars: { variant: 'a!' },
        metadata: { role: 'keep', conversationId: '__scenario_0__' },
        options: { transformVars: 'return { variant: vars.variant + "!" }' },
        provider,
      },
    };

    const plan = createExactHistoricalReplayPlan([candidate]);
    expect(plan.cases[0].test.vars).toEqual({ variant: 'a!' });
    expect(plan.cases[0].test.options?.transformVars).toBeUndefined();
    expect(plan.cases[0].test.provider).toBeUndefined();
    expect(plan.cases[0].providerIdentity).toEqual({ id: 'local:current' });
    expect(
      restoreExactHistoricalReplayCases(plan, [candidate], {
        prompts: [],
        providers: [],
        scenarios: [{ config: [{}], tests: [] }],
      })[0].test.provider,
    ).toBe(provider);
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('fails before execution when a selected value would be redacted', () => {
    const candidate: PreparedHistoricalCandidate = {
      source: { kind: 'top-level', testIndex: 0 },
      test: { vars: { value: 'sk-proj-QAFakeOnly12345678901234567890' } },
    };
    expect(() => createExactHistoricalReplayPlan([candidate])).toThrow(
      'Could not safely save the prepared exact historical selection',
    );
  });

  it('rejects unsupported versions and missing current providers', () => {
    expect(() => validateExactHistoricalReplayPlan({ version: 2, cases: [] })).toThrow(
      'Invalid prepared exact historical replay plan',
    );
    expect(() =>
      validateExactHistoricalReplayPlan({
        version: 1,
        cases: [{ source: { kind: 'top-level', testIndex: -1 }, test: {}, providerIdentity: null }],
      }),
    ).toThrow('Invalid prepared exact historical replay plan');
    const candidate: PreparedHistoricalCandidate = {
      source: { kind: 'top-level', testIndex: 0 },
      test: {
        vars: { value: 'current' },
        provider: {
          id: () => 'local:current',
          callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
        },
      },
    };
    const plan = createExactHistoricalReplayPlan([candidate]);
    expect(() =>
      restoreExactHistoricalReplayCases(plan, [], { prompts: [], providers: [] }),
    ).toThrow('Could not resolve a prepared historical provider for replay');
    for (const test of [
      [],
      { vars: {}, provider: 'file://./old-target.js' },
      { vars: {}, provider: undefined },
      { vars: {}, options: { transformVars: 'return vars' } },
      { vars: {}, options: { transformVars: undefined } },
    ]) {
      expect(() =>
        validateExactHistoricalReplayPlan({
          version: 1,
          cases: [{ source: { kind: 'top-level', testIndex: -1 }, test }],
        }),
      ).toThrow('Invalid prepared exact historical replay plan');
    }
    expect(() =>
      restoreExactHistoricalReplayCases(
        {
          version: 1,
          cases: [
            {
              source: { kind: 'scenario', scenarioIndex: 9, variantIndex: 0, testIndex: -1 },
              test: { vars: {} },
            },
          ],
        },
        [],
        { prompts: [], providers: [], scenarios: [] },
      ),
    ).toThrow('Could not resolve a prepared historical scenario for replay');
  });
});
