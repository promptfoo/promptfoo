import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../../src/providers/index';
import RedteamIterativeProvider from '../../../src/redteam/providers/iterative';
import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';
import RedteamIterativeTreeProvider from '../../../src/redteam/providers/iterativeTree';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { loadStrategy, Strategies } from '../../../src/redteam/strategies/index';
import { addLayerTestCases } from '../../../src/redteam/strategies/layer';

import type { ApiProvider, CallApiContextParams, ProviderOptions } from '../../../src/types/index';

let fixtureDir: string;
beforeEach(async () => {
  vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'true');
  vi.stubEnv('PROMPTFOO_CACHE_ENABLED', 'false');
  fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-layer-input-'));
});
afterEach(async () => {
  redteamProviderManager.clearProvider();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(fixtureDir, { recursive: true, force: true });
});

async function attack(
  step: string,
  fields: Record<string, string>,
  injectVar = '__prompt',
  layers: string[] = [],
  trusted?: string,
) {
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
  const inputs = Object.fromEntries(Object.keys(fields).map((key) => [key, 'Untrusted text']));
  const [test] = await addLayerTestCases(
    [
      {
        vars: {
          [injectVar]: 'Synthetic objective',
          ...Object.fromEntries(Object.keys(fields).map((key) => [key, 'initial value'])),
          trusted: trusted ?? 'trusted initial',
        },
        metadata: { pluginId: 'policy', purpose: 'Synthetic QA', pluginConfig: { inputs } },
      },
    ],
    injectVar,
    {
      steps: [
        {
          id: step,
          config: {
            numIterations: 1,
            maxTurns: 1,
            maxBacktracks: 0,
            stateful: true,
            maxDepth: 1,
            branchingFactor: 1,
            maxAttempts: 5,
          },
        },
        ...layers,
      ],
    },
    Strategies,
    loadStrategy,
  );
  const providerConfig = test.provider as ProviderOptions;
  expect(providerConfig.config?.inputs).toEqual(inputs);
  const raw =
    Object.keys(fields)
      .map((key) => `{{${key}}}`)
      .join('|') + (trusted ? '|{{trusted}}' : '');
  const prompt = { raw, label: raw };
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
  return targetCalls;
}

describe.each([
  'jailbreak',
  'jailbreak:meta',
  'jailbreak:tree',
  'crescendo',
  'hydra',
  'goblin',
  'goat',
])('%s layer input boundaries', (step) => {
  it.each(['txt', 'mjs'])('keeps attacker %s file references literal', async (extension) => {
    const file = path.join(fixtureDir, `canary.${extension}`);
    const canary = 'SYNTHETIC_FILE_CONTENT_MUST_NOT_BE_SENT';
    await fs.writeFile(
      file,
      extension === 'txt' ? canary : `export default () => ({ output: '${canary}' });`,
    );
    const value = `file://${file}`;
    const calls = await attack(step, { document: value });
    for (const call of calls) {
      expect(call.prompt).toContain(value);
      expect(call.prompt).not.toContain('SYNTHETIC_FILE_CONTENT_MUST_NOT_BE_SENT');
    }
  });
  it('still loads file references from trusted non-input configuration', async () => {
    const file = path.join(fixtureDir, 'trusted.txt');
    await fs.writeFile(file, 'SYNTHETIC_TRUSTED_FILE');
    const calls = await attack(
      step,
      { document: 'Synthetic literal' },
      '__prompt',
      [],
      `file://${file}`,
    );
    for (const call of calls) {
      expect(call.prompt).toContain('Synthetic literal|SYNTHETIC_TRUSTED_FILE');
    }
  });
  it('keeps attacker template expressions literal', async () => {
    const value = '{{ 7 * 7 }}';
    const calls = await attack(step, { document: value });
    for (const call of calls) {
      expect(call.prompt).toContain(value);
    }
  });
});

describe.each(['jailbreak', 'jailbreak:meta'])('%s layer transform boundary', (step) => {
  it('preserves literal template delimiters through an attack transformation', async () => {
    const calls = await attack(step, { query: '{{ 7 * 7 }} {% set x = 1 %}' }, 'query', ['rot13']);
    for (const call of calls) {
      expect(call.prompt).toBe('{"dhrel":"{{ 7 * 7 }} {% frg k = 1 %}"}');
    }
  });
  it('retains the full attack transformation when inputs contains injectVar', async () => {
    const fields = { query: 'Synthetic plain attack' };
    const calls = await attack(step, fields, 'query', ['base64']);
    const transformed = Buffer.from(JSON.stringify(fields)).toString('base64');
    for (const call of calls) {
      expect(call.prompt).toBe(transformed);
    }
  });
  it('keeps the extracted injection field when no transform is configured', async () => {
    const calls = await attack(step, { query: 'Synthetic plain attack' }, 'query');
    for (const call of calls) {
      expect(call.prompt).toBe('Synthetic plain attack');
    }
  });
});
