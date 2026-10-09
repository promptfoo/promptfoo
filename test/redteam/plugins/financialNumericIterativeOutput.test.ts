import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../../src/assertions/index';
import { FilesystemBlobStorageProvider } from '../../../src/blobs/filesystemProvider';
import { resetBlobStorageProvider, setBlobStorageProvider } from '../../../src/blobs/index';
import cliState from '../../../src/cliState';
import { runEval } from '../../../src/evaluator';
import { runDbMigrations } from '../../../src/migrate';
import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import IterativeProvider from '../../../src/redteam/providers/iterative';
import ImageProvider from '../../../src/redteam/providers/iterativeImage';
import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';
import TreeProvider from '../../../src/redteam/providers/iterativeTree';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { mockProcessEnv } from '../../util/utils';

import type {
  ApiProvider,
  Assertion,
  AtomicTestCase,
  ProviderResponse,
} from '../../../src/types/index';

type Strategy = 'iterative' | 'meta' | 'tree' | 'image';
const strategies: Strategy[] = ['iterative', 'meta', 'tree', 'image'];
const prompt = { raw: '{{query}}', label: 'numeric JSON with an image' };
const query = 'Return 25 times 4 as a JSON amount with a chart';
const numericAssertion: Assertion = {
  type: 'promptfoo:redteam:financial:calculation-error',
  value: { type: 'numeric', expected: { amount: 100 } },
};
let images: Record<'small' | 'large', string>;

function output(amount: number, size: 'small' | 'large' = 'large', turn = 1, imageUrl = false) {
  return JSON.stringify({
    amount,
    turn,
    data: [{ b64_json: images[size] }],
    ...(imageUrl ? { image: `https://example.com/chart-${turn}.png` } : {}),
  });
}

async function evaluate(
  strategy: Strategy,
  outputs: Array<ProviderResponse['output']>,
  {
    assertion = numericAssertion,
    ratings = [8, 3],
    treeConfig = {},
    attackerError = false,
    targetError = false,
  }: {
    assertion?: Assertion;
    ratings?: Array<number | undefined>;
    treeConfig?: Record<string, number>;
    attackerError?: boolean;
    targetError?: boolean;
  } = {},
) {
  const target: ApiProvider = {
    id: () => 'synthetic-chart-calculator',
    callApi: vi.fn(async () => {
      const turn = vi.mocked(target.callApi).mock.calls.length;
      if (turn > outputs.length) {
        throw new Error('Unexpected extra target call');
      }
      return {
        output: outputs[turn - 1],
        metadata: { turn },
        ...(targetError && turn === outputs.length ? { error: 'Synthetic target error' } : {}),
      };
    }),
  };
  const judgeInputs: string[] = [];
  const visionInputs: string[] = [];
  const judge: ApiProvider = {
    id: () => 'synthetic-heuristic-judge',
    callApi: async (request) => {
      const rating = ratings[judgeInputs.length];
      judgeInputs.push(request);
      return {
        output: JSON.stringify({
          currentResponse: {
            rating,
            components: { safetyBypass: 1, goalAchievement: 1, qualityRelevance: 1 },
            explanation: 'Synthetic heuristic score',
            improvements: [],
          },
          previousBestResponse: { rating: 0 },
        }),
      };
    },
  };
  let attackCalls = 0;
  const attacker: ApiProvider = {
    id: () => 'synthetic-chart-attacker',
    callApi: async (request) => {
      if (request.includes('Current Image Description:')) {
        return judge.callApi(request);
      }
      if (request.includes('"type":"image_url"')) {
        visionInputs.push(request);
        return { output: '{"description":"A synthetic chart"}' };
      }
      if (attackerError && ++attackCalls > 1) {
        return { error: 'Synthetic attacker error' };
      }
      return { output: JSON.stringify({ prompt: query, improvement: 'Synthetic refinement' }) };
    },
  };
  vi.spyOn(redteamProviderManager, 'getProvider').mockResolvedValue(attacker);
  vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue(judge);
  vi.stubEnv('PROMPTFOO_NUM_JAILBREAK_ITERATIONS', String(outputs.length));
  const config = {
    injectVar: 'query',
    numIterations: outputs.length,
    redteamProvider: 'synthetic-local-attacker',
    maxDepth: 2,
    branchingFactor: outputs.length,
    maxAttempts: outputs.length,
    ...treeConfig,
  };
  let metaCalls = 0;
  const delegate: ApiProvider =
    strategy === 'iterative'
      ? new IterativeProvider(config)
      : strategy === 'tree'
        ? new TreeProvider(config)
        : strategy === 'image'
          ? new ImageProvider(config)
          : {
              id: () => 'promptfoo:redteam:iterative:meta',
              callApi: (_request, context) =>
                runMetaAgentRedteam({
                  context,
                  prompt: context!.prompt,
                  filters: undefined,
                  vars: context!.vars,
                  test: context!.test as AtomicTestCase,
                  targetProvider: target,
                  gradingProvider: judge,
                  injectVar: 'query',
                  numIterations: outputs.length,
                  agentProvider: {
                    id: () => 'synthetic-meta-attacker',
                    callApi: async () =>
                      attackerError && ++metaCalls > 1
                        ? {
                            error: 'Synthetic meta request error',
                            metadata: {
                              remoteGenerationError: {
                                status: 400,
                                type: 'invalid_request_error',
                                code: 'invalid_json',
                              },
                            },
                          }
                        : { output: { result: query } },
                  },
                }),
            };
  let response: ProviderResponse | undefined;
  const provider: ApiProvider = {
    id: () => delegate.id(),
    callApi: async (...args) => {
      response = await delegate.callApi(...args);
      return response;
    },
  };
  const test: AtomicTestCase = {
    provider,
    vars: { query },
    assert: [assertion],
    metadata: { purpose: 'A financial calculator', pluginId: 'financial:calculation-error' },
  };
  const [row] = await runEval({
    provider: target,
    prompt,
    test,
    testIdx: 0,
    promptIdx: 0,
    delay: 0,
    repeatIndex: 0,
    evaluateOptions: { cache: false },
    conversations: {},
    registers: {},
    isRedteam: true,
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
  return { row, response, target, judgeInputs, visionInputs, test };
}

describe('original numeric JSON in iterative media responses', () => {
  let directory: string;
  let restoreEnv: () => void;
  let previousBasePath: string | undefined;

  beforeAll(async () => {
    await runDbMigrations();
    const buffers = await Promise.all(
      [1, 64].map((size) =>
        sharp({ create: { width: size, height: size, channels: 3, background: 'white' } })
          .png({ compressionLevel: 0 })
          .toBuffer(),
      ),
    );
    images = { small: buffers[0].toString('base64'), large: buffers[1].toString('base64') };
  });

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-iterative-output-'));
    restoreEnv = mockProcessEnv({
      PROMPTFOO_CONFIG_DIR: directory,
      PROMPTFOO_INLINE_MEDIA: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
    });
    previousBasePath = cliState.basePath;
    cliState.basePath = directory;
    setBlobStorageProvider(
      new FilesystemBlobStorageProvider({ basePath: path.join(directory, 'blobs') }),
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockRejectedValue(
      new Error('Numeric checks must not use an LLM grader'),
    );
  });

  afterEach(async () => {
    cliState.basePath = previousBasePath;
    resetBlobStorageProvider();
    restoreEnv();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(
    strategies.flatMap((strategy) =>
      [false, true].flatMap((inline) =>
        (['small', 'large'] as const).flatMap((size) =>
          [100, 101].map((amount) => ({ strategy, inline, size, amount })),
        ),
      ),
    ),
  )(
    '$strategy grades amount=$amount with $size media and inline=$inline',
    async ({ strategy, inline, size, amount }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const raw = output(amount, size);
      const { row, response, target, judgeInputs } = await evaluate(strategy, [raw]);

      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(response?.output).toBe(raw);
      expect(row.success).toBe(amount === 100);
      expect(row.failureReason).toBe(amount === 100 ? 0 : 1);
      if (strategy !== 'image') {
        expect(response?.metadata?.storedGraderResult.pass).toBe(amount === 100);
      }
      if (!inline && size === 'large') {
        expect(row.response?.output).toMatch(/^promptfoo:\/\/blob\//);
        expect(judgeInputs.every((request) => !request.includes(images.large))).toBe(true);
        if (strategy !== 'image') {
          const history =
            response?.metadata?.redteamTreeHistory ?? response?.metadata?.redteamHistory;
          expect(history[0].output).toMatch(/^promptfoo:\/\/blob\//);
        }
      } else {
        expect(row.response?.output).toBe(raw);
      }
      expect(response?.metadata).not.toHaveProperty('targetOutput');
    },
  );

  it.each(strategies)('%s returns the matching second raw response', async (strategy) => {
    const values = [output(100), output(101, 'large', 2)];
    const { row, response, target } = await evaluate(strategy, values);

    expect(target.callApi).toHaveBeenCalledTimes(2);
    expect(response?.output).toBe(values[1]);
    expect(response?.metadata?.redteamTargetMetadata.turn).toBe(2);
    expect(row.success).toBe(false);
    expect(row.failureReason).toBe(1);
    if (strategy !== 'image') {
      expect(response?.metadata?.storedGraderResult.pass).toBe(false);
    }
  });

  it.each(['iterative', 'tree'] as const)(
    '%s returns the earlier best raw response while normalizing judge and history inputs',
    async (strategy) => {
      const values = [output(100), output(100, 'large', 2)];
      const { row, response, target, judgeInputs } = await evaluate(strategy, values);

      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(response?.output).toBe(values[0]);
      expect(response?.metadata?.redteamTargetMetadata.turn).toBe(1);
      expect(row.success).toBe(true);
      expect(judgeInputs).toHaveLength(2);
      expect(judgeInputs.every((request) => request.includes('promptfoo://blob/'))).toBe(true);
      expect(judgeInputs.every((request) => !request.includes(images.large))).toBe(true);
    },
  );

  it.each(['iterative', 'meta'] as const)(
    '%s keeps the last fallback raw response',
    async (strategy) => {
      const values = [output(100), output(100, 'large', 2)];
      const { row, response, target } = await evaluate(strategy, values, { ratings: [] });

      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(response?.output).toBe(values[1]);
      expect(response?.metadata?.redteamTargetMetadata.turn).toBe(2);
      expect(row.success).toBe(true);
    },
  );

  it.each([false, true])(
    'image keeps its selected earlier response with inline=%s',
    async (inline) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const values = [
        output(100, inline ? 'large' : 'small', 1, true),
        output(101, 'large', 2, true),
      ];
      const { row, response, target, visionInputs } = await evaluate('image', values);

      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(response?.output).toBe(values[0]);
      expect(response?.metadata?.redteamTargetMetadata.turn).toBe(1);
      expect(visionInputs).toHaveLength(inline ? 2 : 1);
      expect(row.success).toBe(true);
    },
  );

  it.each(['MAX_DEPTH', 'NO_IMPROVEMENT'] as const)(
    'tree keeps the selected raw response at %s',
    async (stopReason) => {
      const values = [output(100), output(100, 'large', 2), output(101, 'large', 3)];
      const { row, response } = await evaluate('tree', values, {
        ratings: [8, 0],
        treeConfig: {
          maxAttempts: 10,
          branchingFactor: 2,
          maxDepth: stopReason === 'MAX_DEPTH' ? 1 : 2,
          maxNoImprovement: stopReason === 'NO_IMPROVEMENT' ? 1 : 10,
        },
      });

      expect(response?.output).toBe(values[0]);
      expect(response?.metadata?.redteamTargetMetadata.turn).toBe(1);
      expect(response?.metadata?.stopReason).toBe(stopReason);
      expect(row.success).toBe(true);
    },
  );

  it.each(strategies)('%s still rejects object-derived numeric output', async (strategy) => {
    const { row } = await evaluate(strategy, [JSON.parse(output(100))]);

    expect(row.success).toBe(false);
    expect(row.failureReason).toBe(2);
    expect(row.error).toContain('requires raw JSON text');
  });

  it.each(strategies.flatMap((strategy) => [false, true].map((inline) => ({ strategy, inline }))))(
    '$strategy keeps numeric-disabled replay provenance with inline=$inline',
    async ({ strategy, inline }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const { row, response, test } = await evaluate(strategy, [output(100)], {
        assertion: { type: 'contains', value: inline ? '"amount":100' : 'promptfoo://blob/' },
      });

      expect(response?.output).toBe(inline ? output(100) : row.response?.output);
      expect(response?.metadata?.redteamTargetMetadata).toBeUndefined();
      expect(response?.metadata?.redteamOutputIsText).toBe(inline);
      expect(row.success).toBe(true);
      // A later transform cannot recreate source evidence from a saved blob URI.
      const assertion: Assertion = {
        ...numericAssertion,
        transform: 'JSON.stringify({ amount: 100 })',
      };
      const replay = runAssertion({
        prompt: query,
        assertion,
        test: { ...test, assert: [assertion] },
        providerResponse: row.response!,
      });
      if (inline) {
        expect((await replay).pass).toBe(true);
      } else {
        expect(response?.output).toMatch(/^promptfoo:\/\/blob\//);
        await expect(replay).rejects.toThrow('requires raw JSON text');
      }
    },
  );

  it.each(strategies.flatMap((strategy) => [false, true].map((inline) => ({ strategy, inline }))))(
    '$strategy keeps runtime-error output normalized with inline=$inline',
    async ({ strategy, inline }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const values = [output(100), output(100, 'large', 2)];
      const { row, response, target } = await evaluate(strategy, values, {
        attackerError: strategy === 'tree' || strategy === 'meta',
        targetError: strategy === 'iterative' || strategy === 'image',
      });
      const selectedTurn = strategy === 'image' ? 2 : 1;

      expect(target.callApi).toHaveBeenCalledTimes(
        strategy === 'tree' || strategy === 'meta' ? 1 : 2,
      );
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(2);
      expect(row.error).toContain('Synthetic');
      expect(response?.metadata?.redteamTargetMetadata.turn).toBe(selectedTurn);
      expect(response?.metadata?.redteamOutputIsText).toBe(inline);
      if (inline) {
        expect(response?.output).toBe(values[selectedTurn - 1]);
      } else {
        expect(response?.output).toMatch(/^promptfoo:\/\/blob\//);
        expect(JSON.stringify(row)).not.toContain(images.large);
      }
    },
  );
});
