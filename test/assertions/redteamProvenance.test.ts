import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { RedteamGraderBase } from '../../src/redteam/plugins/base';
import { runMetaAgentRedteam } from '../../src/redteam/providers/iterativeMeta';

import type { ApiProvider, Assertion, AtomicTestCase } from '../../src/types/index';

const prompt = 'Return an amount as JSON';
const rawOutput = '{"amount":9007199254740993}';
const roundedOutput = '{"amount":9007199254740992}';
const assertion: Assertion = {
  type: 'promptfoo:redteam:financial:calculation-error',
  value: { type: 'numeric', expected: { amount: '9007199254740992' } },
};
const test: AtomicTestCase = { metadata: { purpose: 'A financial calculator' } };

function providerWithId(id: string): ApiProvider {
  return {
    id: () => id,
    callApi: async () => {
      throw new Error('Assertion replay must not call the provider');
    },
  };
}

describe('redteam numeric output provenance through the public assertion API', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unexpected network request');
      }),
    );
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockRejectedValue(
      new Error('Numeric replay must not call the LLM grader'),
    );
  });

  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([false, true])(
    'preserves a serialized Meta response with both provider identities omitted (text: %s)',
    async (outputIsText) => {
      const target: ApiProvider = {
        id: () => 'synthetic-calculator',
        callApi: vi.fn(async () => ({
          output: outputIsText ? rawOutput : JSON.parse(rawOutput),
        })),
      };
      const strategyPrompt = { raw: '{{query}}', label: 'numeric replay' };
      const strategyTest: AtomicTestCase = { ...test, vars: { query: prompt }, assert: [] };
      const response = await runMetaAgentRedteam({
        context: {
          prompt: strategyPrompt,
          vars: strategyTest.vars!,
          test: strategyTest,
          originalProvider: target,
        },
        prompt: strategyPrompt,
        filters: undefined,
        vars: strategyTest.vars!,
        test: strategyTest,
        targetProvider: target,
        gradingProvider: target,
        injectVar: 'query',
        numIterations: 1,
        agentProvider: {
          id: () => 'synthetic-attacker',
          callApi: async () => ({ output: { result: prompt } }),
        },
      });
      const savedResponse = JSON.parse(JSON.stringify(response));
      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(savedResponse).toMatchObject({
        output: outputIsText ? rawOutput : roundedOutput,
        metadata: { redteamOutputIsText: outputIsText },
      });

      const result = runAssertion({ prompt, assertion, test, providerResponse: savedResponse });
      if (outputIsText) {
        // The original token must still differ from the rounded reference.
        expect(await result).toMatchObject({ pass: false, score: 0 });
      } else {
        await expect(result).rejects.toThrow(/requires raw JSON text/);
      }
    },
  );

  it.each([undefined, true, false])(
    'honors a negative marker when provider identity is absent (marker: %s)',
    async (marker) => {
      const result = runAssertion({
        prompt,
        assertion,
        test,
        providerResponse: {
          output: roundedOutput,
          metadata: { redteamOutputIsText: marker },
        },
      });
      if (marker === false) {
        await expect(result).rejects.toThrow(/requires raw JSON text/);
      } else {
        expect(await result).toMatchObject({ pass: true, score: 1 });
      }
    },
  );

  it.each([
    ['promptfoo:redteam:iterative:meta', true, true],
    ['promptfoo:redteam:iterative:meta', false, false],
    ['promptfoo:redteam:iterative:meta', undefined, false],
    ['synthetic-calculator', true, true],
    ['synthetic-calculator', false, true],
    ['synthetic-calculator', undefined, true],
    ['promptfoo:redteam:unknown-wrapper', true, false],
    ['promptfoo:redteam:unknown-wrapper', false, false],
    ['promptfoo:redteam:unknown-wrapper', undefined, false],
  ] as const)(
    'preserves identity-based eligibility for %s (marker: %s, eligible: %s)',
    async (providerId, marker, eligible) => {
      for (const identitySource of ['test', 'provider']) {
        const result = runAssertion({
          prompt,
          assertion,
          test: identitySource === 'test' ? { ...test, provider: providerId } : test,
          ...(identitySource === 'provider' ? { provider: providerWithId(providerId) } : {}),
          providerResponse: {
            output: roundedOutput,
            metadata: { redteamOutputIsText: marker },
          },
        });
        if (eligible) {
          expect(await result).toMatchObject({ pass: true, score: 1 });
        } else {
          await expect(result).rejects.toThrow(/requires raw JSON text/);
        }
      }
    },
  );

  it.each([undefined, 'synthetic-calculator', 'promptfoo:redteam:iterative:meta'])(
    'does not let a positive marker override observed non-text output (provider: %s)',
    async (providerId) => {
      for (const providerResponse of [
        { output: JSON.parse(rawOutput), metadata: { redteamOutputIsText: true } },
        { output: roundedOutput, metadata: { redteamOutputIsText: true } },
      ]) {
        await expect(
          runAssertion({
            prompt,
            assertion,
            test,
            ...(providerId ? { provider: providerWithId(providerId) } : {}),
            providerResponse,
            ...(typeof providerResponse.output === 'string' ? { outputIsText: false } : {}),
          }),
        ).rejects.toThrow(/requires raw JSON text/);
      }
    },
  );
});
