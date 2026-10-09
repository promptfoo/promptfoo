import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesystemBlobStorageProvider } from '../../../src/blobs/filesystemProvider';
import {
  getBlobByHash,
  resetBlobStorageProvider,
  setBlobStorageProvider,
} from '../../../src/blobs/index';
import cliState from '../../../src/cliState';
import { runEval } from '../../../src/evaluator';
import { runDbMigrations } from '../../../src/migrate';
import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import { CrescendoProvider } from '../../../src/redteam/providers/crescendo/index';
import { CustomProvider } from '../../../src/redteam/providers/custom/index';
import { GoblinProvider } from '../../../src/redteam/providers/goblin/index';
import { HydraProvider } from '../../../src/redteam/providers/hydra/index';
import { mockProcessEnv } from '../../util/utils';

import type {
  ApiProvider,
  Assertion,
  AtomicTestCase,
  ProviderResponse,
} from '../../../src/types/index';

vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal()),
  shouldGenerateRemote: () => true,
}));

type Strategy = 'hydra' | 'goblin' | 'custom' | 'crescendo';
type Observation = { turn: unknown; hasAudio: boolean };
const strategies: Strategy[] = ['hydra', 'goblin', 'custom', 'crescendo'];
const audioData = Buffer.alloc(24 * 1024, 7).toString('base64');
const prompt = { raw: '{{query}}', label: 'numeric wrapper media' };
const numericAssertion: Assertion = {
  type: 'promptfoo:redteam:financial:calculation-error',
  value: { type: 'numeric', expected: { amount: 100 } },
};

function createAttack(strategy: Strategy, maxTurns = 2, continueAfterSuccess = false) {
  const config = {
    injectVar: 'query',
    maxTurns,
    maxBacktracks: 0,
    stateful: false,
    continueAfterSuccess,
    strategyText: 'Return an amount as JSON',
    redteamProvider: undefined,
  };
  const provider =
    strategy === 'hydra'
      ? new HydraProvider(config)
      : strategy === 'goblin'
        ? new GoblinProvider(config)
        : strategy === 'custom'
          ? new CustomProvider(config)
          : new CrescendoProvider(config);
  if (strategy === 'hydra' || strategy === 'goblin') {
    const attack = provider as unknown as { agentProvider: ApiProvider };
    attack.agentProvider = {
      id: () => 'synthetic-attacker',
      callApi: async () => ({ output: 'Return an amount as JSON' }),
    };
  } else {
    const attack = provider as unknown as {
      getAttackPrompt: () => Promise<{ generatedQuestion: string }>;
      getEvalScore: () => Promise<unknown>;
      getRefusalScore: () => Promise<unknown>;
    };
    vi.spyOn(attack, 'getAttackPrompt').mockResolvedValue({
      generatedQuestion: 'Return an amount as JSON',
    });
    const score = { value: false, metadata: 0, rationale: 'Synthetic objective check' };
    vi.spyOn(attack, 'getEvalScore').mockResolvedValue(score);
    vi.spyOn(attack, 'getRefusalScore').mockResolvedValue([false, 'Synthetic legacy check']);
  }
  return provider;
}

function createTarget(amounts: number[], ended = false) {
  const responses: ProviderResponse[] = amounts.map((amount, index) => ({
    output: JSON.stringify({ amount }),
    metadata: {
      turn: index + 1,
      audio: { data: audioData, format: 'wav' },
    },
    ...(ended && index === amounts.length - 1 ? { conversationEnded: true } : {}),
  }));
  const target: ApiProvider = {
    id: () => 'synthetic-audio-target',
    callApi: vi.fn(async () => {
      const response = responses[vi.mocked(target.callApi).mock.calls.length - 1];
      if (!response) {
        throw new Error('Unexpected extra target call');
      }
      return response;
    }),
  };
  return { target, responses };
}

async function evaluate(
  provider: ApiProvider,
  target: ApiProvider,
  assertion: Assertion,
  transform?: NonNullable<AtomicTestCase['options']>['transform'],
) {
  const test: AtomicTestCase = {
    provider,
    vars: { query: 'Return an amount as JSON' },
    assert: [assertion],
    ...(transform ? { options: { transform } } : {}),
    metadata: {
      purpose: 'A financial calculator',
      pluginId: 'financial:calculation-error',
      strategyId: provider.id().split(':').at(-1),
    },
  };
  const [row] = await runEval({
    provider: target,
    prompt,
    test,
    testIdx: 0,
    promptIdx: 0,
    delay: 0,
    repeatIndex: 0,
    evaluateOptions: {},
    conversations: {},
    registers: {},
    isRedteam: true,
  });
  return row;
}

describe('raw selected metadata in multi-turn numeric wrappers', () => {
  let directory: string;
  let restoreEnv: () => void;
  let previousBasePath: string | undefined;
  let observations: Observation[];
  let transform: NonNullable<Assertion['transform']>;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-wrapper-media-'));
    restoreEnv = mockProcessEnv({
      PROMPTFOO_CONFIG_DIR: directory,
      PROMPTFOO_INLINE_MEDIA: 'false',
    });
    previousBasePath = cliState.basePath;
    cliState.basePath = directory;
    setBlobStorageProvider(
      new FilesystemBlobStorageProvider({ basePath: path.join(directory, 'blobs') }),
    );
    observations = [];
    transform = (output, context) => {
      const audio = context.metadata?.audio as { data?: unknown } | undefined;
      const hasAudio = audio?.data === audioData;
      observations.push({ turn: context.metadata?.turn, hasAudio });
      return hasAudio ? output : '{"amount":999}';
    };
    vi.stubGlobal('__numericWrapperMediaObservations', observations);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unexpected network request');
      }),
    );
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockRejectedValue(
      new Error('Explicit numeric checks must not call an LLM grader'),
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
        ['test', 'assertion', 'script'].map((stage) => ({ strategy, inline, stage })),
      ),
    ),
  )(
    '$strategy preserves live $stage audio inputs with inline=$inline',
    async ({ strategy, inline, stage }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const { target, responses } = createTarget([100, 101]);
      const assertion: Assertion = {
        ...numericAssertion,
        ...(stage === 'assertion' ? { transform } : {}),
      };
      if (stage === 'script') {
        await fs.writeFile(
          path.join(directory, 'reference.cjs'),
          'module.exports = (_output, context) => { const hasAudio = typeof context.metadata?.audio?.data === "string" && context.metadata.audio.data === context.providerResponse.metadata?.audio?.data; globalThis.__numericWrapperMediaObservations.push({ turn: context.metadata?.turn, hasAudio }); return { type: "numeric", expected: { amount: hasAudio ? 100 : 999 } }; };',
        );
        assertion.value = 'file://reference.cjs';
        assertion.config = { numeric: true };
      }
      const row = await evaluate(
        createAttack(strategy),
        target,
        assertion,
        stage === 'test' ? transform : undefined,
      );

      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(observations).toEqual([
        { turn: 1, hasAudio: true },
        { turn: 2, hasAudio: true },
        { turn: 2, hasAudio: true },
      ]);
      expect(row.response?.output).toBe('{"amount":101}');
      expect(row.response?.metadata?.storedGraderResult.pass).toBe(false);
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(1);
      for (const copy of [row.response?.metadata, row.metadata]) {
        const captured = copy?.redteamTargetMetadata;
        expect(captured.turn).toBe(2);
        if (inline) {
          expect(captured.audio.data === audioData).toBe(true);
        } else {
          expect(captured.audio.data).toBeUndefined();
          expect(
            (await getBlobByHash(captured.audio.blobRef.hash)).data.toString('base64') ===
              audioData,
          ).toBe(true);
        }
      }
      expect(responses.every((response) => response.metadata?.audio.data === audioData)).toBe(true);
    },
  );

  it.each(
    (['custom', 'crescendo'] as const).flatMap((strategy) =>
      [false, true].map((inline) => ({ strategy, inline })),
    ),
  )(
    '$strategy keeps a flagged turn snapshot after continuing with inline=$inline',
    async ({ strategy, inline }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const { target } = createTarget([100, 101, 100]);
      const row = await evaluate(
        createAttack(strategy, 3, true),
        target,
        numericAssertion,
        transform,
      );

      expect(target.callApi).toHaveBeenCalledTimes(3);
      expect(observations).toEqual([
        { turn: 1, hasAudio: true },
        { turn: 2, hasAudio: true },
        { turn: 3, hasAudio: true },
        { turn: 2, hasAudio: true },
      ]);
      expect(row.response?.output).toBe('{"amount":101}');
      expect(row.response?.metadata?.redteamTargetMetadata.turn).toBe(2);
      expect(row.response?.metadata?.storedGraderResult.pass).toBe(false);
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(1);
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      [false, true].flatMap((inline) =>
        [false, true].map((ended) => ({ strategy, inline, ended })),
      ),
    ),
  )(
    '$strategy keeps the latest fallback or stop snapshot with inline=$inline ended=$ended',
    async ({ strategy, inline, ended }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const { target } = createTarget([100, ended ? 101 : 100], ended);
      const row = await evaluate(createAttack(strategy), target, numericAssertion, transform);

      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(observations).toEqual(
        ended
          ? [
              { turn: 1, hasAudio: true },
              { turn: 2, hasAudio: true },
            ]
          : [
              { turn: 1, hasAudio: true },
              { turn: 2, hasAudio: true },
              { turn: 2, hasAudio: true },
            ],
      );
      expect(row.response?.output).toBe(ended ? '{"amount":101}' : '{"amount":100}');
      expect(row.response?.metadata?.redteamTargetMetadata.turn).toBe(2);
      expect(row.success).toBe(!ended);
      expect(row.failureReason).toBe(ended ? 1 : 0);
      if (ended) {
        expect(row.response?.metadata?.stopReason).toBe('Target ended conversation');
      }
    },
  );

  it.each(strategies)('%s leaves numeric-disabled metadata uncaptured', async (strategy) => {
    const { target } = createTarget([100]);
    const row = await evaluate(createAttack(strategy, 1), target, {
      type: 'contains',
      value: '100',
    });

    expect(target.callApi).toHaveBeenCalledTimes(1);
    expect(row.success).toBe(true);
    expect(row.response?.metadata?.redteamTargetMetadata).toBeUndefined();
  });
});
