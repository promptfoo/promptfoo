import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../../src/providers/index';
import RedteamIterativeProvider from '../../../src/redteam/providers/iterative';
import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';
import RedteamIterativeTreeProvider from '../../../src/redteam/providers/iterativeTree';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { loadStrategy, Strategies } from '../../../src/redteam/strategies/index';
import { addLayerTestCases } from '../../../src/redteam/strategies/layer';

import type {
  ApiProvider,
  CallApiContextParams,
  Prompt,
  ProviderOptions,
} from '../../../src/types/index';

beforeEach(() => {
  vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'true');
  vi.stubEnv('PROMPTFOO_CACHE_ENABLED', 'false');
});
afterEach(() => {
  redteamProviderManager.clearProvider();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function attack(
  step: string,
  mode: 'none' | 'metadata' | 'explicit',
  kind: 'parse' | 'equality' | 'encoding' | 'template',
) {
  const injectVar = 'query';
  const initial = JSON.stringify({ text: 'Initial trusted {{ 7 * 7 }}', number: 3 });
  const generated = JSON.stringify({ text: 'Generated {{ 7 * 7 }}', number: 4 });
  const fields = { document: generated };
  const inputs = { document: 'Untrusted text' };
  const expected = mode === 'explicit' ? generated : initial;
  const observed: unknown[] = [];
  if (['hydra', 'goblin', 'goat'].includes(step)) {
    vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'false');
    vi.stubEnv('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION', 'false');
    vi.stubEnv('PROMPTFOO_REMOTE_GENERATION_URL', 'http://localhost/synthetic-task');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      expect(String(url)).toBe('http://localhost/synthetic-task');
      return Response.json({
        result: JSON.stringify(fields),
        message: { role: 'user', content: JSON.stringify(fields) },
        materializationHandled: true,
        materializedVars: fields,
        tokenUsage: { total: 0, numRequests: 1 },
      });
    });
  }
  const attacker: ApiProvider = {
    id: () => 'synthetic-local-attacker',
    async callApi() {
      return {
        output:
          step === 'jailbreak:meta'
            ? JSON.stringify(fields)
            : JSON.stringify({
                improvement: 'Synthetic fixture',
                prompt: JSON.stringify(fields),
                generatedQuestion: JSON.stringify(fields),
                rationaleBehindJailbreak: 'Synthetic fixture',
                lastResponseSummary: '',
              }),
      };
    },
  };
  const grader: ApiProvider = {
    id: () => 'synthetic-local-grader',
    async callApi(_prompt, context) {
      return {
        output: JSON.stringify(
          context?.prompt?.label === 'refusal' || context?.prompt?.label === 'eval'
            ? { value: false, metadata: 0, rationale: 'Synthetic fixture' }
            : {
                currentResponse: { rating: 5, explanation: 'Synthetic fixture' },
                previousBestResponse: { rating: 0, explanation: 'Synthetic fixture' },
              },
        ),
      };
    },
  };
  await redteamProviderManager.setProvider(attacker);
  await redteamProviderManager.setGradingProvider(grader);
  const targetCalls: { prompt: string; vars: unknown }[] = [];
  const target: ApiProvider = {
    id: () => 'synthetic-local-target',
    async callApi(prompt, context) {
      targetCalls.push({ prompt, vars: context?.vars });
      return { output: 'Synthetic target response' };
    },
  };
  const [test] = await addLayerTestCases(
    [
      {
        vars: {
          [injectVar]: 'Synthetic objective',
          document: initial,
          trusted: 'Trusted template value',
        },
        metadata: {
          pluginId: 'policy',
          purpose: 'Synthetic QA',
          pluginConfig: { ...(mode === 'metadata' && { inputs }) },
        },
      },
    ],
    injectVar,
    {
      steps: [
        {
          id: step,
          config: {
            ...(mode === 'explicit' && { inputs }),
            numIterations: 1,
            maxTurns: 1,
            maxBacktracks: 0,
            stateful: true,
            maxDepth: 1,
            branchingFactor: 1,
            maxAttempts: 5,
          },
        },
      ],
    },
    Strategies,
    loadStrategy,
  );
  const providerConfig = test.provider as ProviderOptions;
  const prompt: Prompt = {
    raw: '{{document}}',
    label: 'Owned function contract',
    function: async ({ vars }) => {
      observed.push(vars.document);
      if (kind === 'parse') {
        return JSON.parse(String(vars.document)).text;
      }
      if (kind === 'equality') {
        return vars.document === expected ? 'Exact function input' : 'Changed function input';
      }
      if (kind === 'encoding') {
        return Buffer.from(String(vars.document)).toString('base64');
      }
      return '{{ trusted }}|' + JSON.parse(String(vars.document)).text;
    },
  };
  const context = {
    prompt,
    vars: test.vars!,
    test,
    originalProvider: target,
  } as CallApiContextParams;
  if (step === 'jailbreak:meta') {
    await runMetaAgentRedteam({
      prompt,
      filters: undefined,
      vars: test.vars!,
      test,
      context,
      agentProvider: attacker,
      gradingProvider: grader,
      targetProvider: target,
      injectVar,
      numIterations: 1,
      inputs: providerConfig.config!.inputs,
      perTurnLayers: providerConfig.config!._perTurnLayers,
    });
  } else {
    const provider =
      step === 'jailbreak'
        ? new RedteamIterativeProvider(providerConfig.config!)
        : step === 'jailbreak:tree'
          ? new RedteamIterativeTreeProvider(providerConfig.config!)
          : await loadApiProvider(providerConfig.id!, { options: providerConfig });
    await provider.callApi('Synthetic initial prompt', context);
  }
  expect(targetCalls.length).toBeGreaterThan(0);
  expect(observed.length).toBeGreaterThan(0);
  expect(observed).toEqual(observed.map(() => expected));
  const renderedText = JSON.parse(expected).text.replace('{{ 7 * 7 }}', '49');
  const output =
    kind === 'equality'
      ? 'Exact function input'
      : kind === 'encoding'
        ? Buffer.from(expected).toString('base64')
        : kind === 'template'
          ? `Trusted template value|${renderedText}`
          : renderedText;
  for (const call of targetCalls) {
    expect(call.prompt).toContain(output);
  }
}

describe.each([
  'hydra',
  'goblin',
  'crescendo',
  'goat',
  'jailbreak',
  'jailbreak:meta',
  'jailbreak:tree',
])('%s layer prompt compatibility', (step) => {
  describe.each(['none', 'metadata', 'explicit'] as const)('%s inputs', (mode) => {
    it.each(['parse', 'equality', 'encoding', 'template'] as const)(
      'preserves %s function semantics',
      async (kind) => {
        await attack(step, mode, kind);
      },
    );
  });
});
