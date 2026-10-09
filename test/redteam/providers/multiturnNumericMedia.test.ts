import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../../src/assertions/index';
import { FilesystemBlobStorageProvider } from '../../../src/blobs/filesystemProvider';
import {
  getBlobByHash,
  resetBlobStorageProvider,
  setBlobStorageProvider,
} from '../../../src/blobs/index';
import { runEval } from '../../../src/evaluator';
import { runDbMigrations } from '../../../src/migrate';
import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import { CrescendoProvider } from '../../../src/redteam/providers/crescendo/index';
import { CustomProvider } from '../../../src/redteam/providers/custom/index';
import { GoblinProvider } from '../../../src/redteam/providers/goblin/index';
import { HydraProvider } from '../../../src/redteam/providers/hydra/index';
import * as shared from '../../../src/redteam/providers/shared';
import { ProviderGroupedCallQueue } from '../../../src/scheduler/providerCallQueue';
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
const strategies: Strategy[] = ['hydra', 'goblin', 'custom', 'crescendo'];
const prompt = { raw: '{{query}}', label: 'numeric JSON media' };
const largeImage = Buffer.alloc(24 * 1024, 7).toString('base64');
const smallImage = Buffer.alloc(64, 7).toString('base64');
const numericAssertion: Assertion = {
  type: 'promptfoo:redteam:financial:calculation-error',
  value: { type: 'numeric', expected: { amount: 100 } },
};
const legacyAssertion: Assertion = {
  type: 'promptfoo:redteam:financial:calculation-error',
  value: 'Check the calculation',
};

function createAttack(strategy: Strategy, maxTurns = 1, continueAfterSuccess = false) {
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

function createTarget(
  amounts: number[],
  { large = true, object = false, ended = false, audio = false } = {},
) {
  const responses: ProviderResponse[] = amounts.map((amount, index) => {
    const output = { amount, data: [{ b64_json: large ? largeImage : smallImage }] };
    return {
      output: object ? output : JSON.stringify(output),
      ...(audio
        ? {
            metadata: {
              turn: index + 1,
              audio: {
                data: Buffer.alloc(24 * 1024, index + 17).toString('base64'),
                format: 'wav',
              },
            },
          }
        : {}),
      ...(ended && index === amounts.length - 1 ? { conversationEnded: true } : {}),
    };
  });
  const target: ApiProvider = {
    id: () => 'synthetic-image-calculator',
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

async function expectSelectedAudio(
  response: ProviderResponse | undefined,
  selectedResponse: ProviderResponse,
  inline: boolean,
) {
  const source = selectedResponse.metadata!;
  const captured = response?.metadata?.redteamTargetMetadata;
  expect(captured.turn).toBe(source.turn);
  if (inline) {
    expect(captured.audio.data).toBe(source.audio.data);
  } else {
    expect(captured.audio.data).toBeUndefined();
    expect(captured.audio.blobRef.uri).toMatch(/^promptfoo:\/\/blob\//);
    expect((await getBlobByHash(captured.audio.blobRef.hash)).data.toString('base64')).toBe(
      source.audio.data,
    );
    expect(JSON.stringify(captured)).not.toContain(source.audio.data);
  }
}

async function evaluate(
  provider: ApiProvider,
  target: ApiProvider,
  assertions: Assertion[],
  deferGrading = false,
) {
  const test: AtomicTestCase = {
    provider,
    vars: { query: 'Return an amount as JSON' },
    assert: assertions,
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
    deferGrading,
    ...(deferGrading ? { providerCallQueue: new ProviderGroupedCallQueue() } : {}),
  });
  if (deferGrading) {
    await vi.waitFor(() => expect(row.gradingResult || row.error).toBeTruthy());
  }
  return row;
}

describe('raw selected numeric JSON before multi-turn media normalization', () => {
  let directory: string;
  let restoreEnv: () => void;
  let observations: number[];
  let assertion: Assertion;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-json-media-'));
    restoreEnv = mockProcessEnv({ PROMPTFOO_INLINE_MEDIA: 'false' });
    setBlobStorageProvider(
      new FilesystemBlobStorageProvider({ basePath: path.join(directory, 'blobs') }),
    );
    observations = [];
    assertion = {
      ...numericAssertion,
      transform: (output) => {
        observations.push(JSON.parse(output as string).amount);
        return output;
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unexpected network request');
      }),
    );
    vi.spyOn(shared, 'tryUnblocking').mockResolvedValue({ success: false });
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockRejectedValue(
      new Error('Explicit numeric checks must not call an LLM grader'),
    );
  });

  afterEach(async () => {
    expect(fetch).not.toHaveBeenCalled();
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
        [false, true].flatMap((large) =>
          [100, 101].map((amount) => ({ strategy, inline, large, amount })),
        ),
      ),
    ),
  )(
    '$strategy grades raw amount=$amount with large=$large inline=$inline',
    async ({ strategy, inline, large, amount }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const { target, responses } = createTarget([amount], { large });
      const row = await evaluate(createAttack(strategy), target, [assertion]);

      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(observations).toEqual([amount, amount]);
      expect(row.success).toBe(amount === 100);
      expect(row.failureReason).toBe(amount === 100 ? 0 : 1);
      expect(row.response?.metadata?.storedGraderResult.pass).toBe(amount === 100);
      expect(row.response?.metadata?.redteamTargetMetadata).toBeNull();
      expect(row.response?.metadata?.redteamOutputIsText).toBe(inline || !large);
      if (large && !inline) {
        expect(row.response?.output).toMatch(/^promptfoo:\/\/blob\//);
        expect(row.response?.metadata?.redteamHistory[0].output).toMatch(/^promptfoo:\/\/blob\//);
      } else {
        expect(row.response?.output).toBe(responses[0].output);
      }
      expect(JSON.parse(responses[0].output as string).amount).toBe(amount);
      expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    },
  );

  it.each(strategies.flatMap((strategy) => [100, 101].map((amount) => ({ strategy, amount }))))(
    '$strategy defers numeric grading of raw amount=$amount',
    async ({ strategy, amount }) => {
      const { target } = createTarget([amount]);
      const row = await evaluate(createAttack(strategy), target, [assertion], true);

      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(observations).toEqual([amount, amount]);
      expect(row.success).toBe(amount === 100);
      expect(row.failureReason).toBe(amount === 100 ? 0 : 1);
      expect(row.response?.output).toMatch(/^promptfoo:\/\/blob\//);
      expect(row.response?.metadata?.redteamOutputIsText).toBe(false);
      expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    },
  );

  it.each(
    (['custom', 'crescendo'] as const).flatMap((strategy) =>
      [false, true].map((inline) => ({ strategy, inline })),
    ),
  )(
    '$strategy retains the failed turn JSON after continuing with inline=$inline',
    async ({ strategy, inline }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const { target } = createTarget([101, 100]);
      const row = await evaluate(createAttack(strategy, 2, true), target, [assertion]);

      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(observations).toEqual([101, 100, 101]);
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(1);
      expect(row.response?.metadata?.storedGraderResult.pass).toBe(false);
      expect(row.response?.metadata?.messages).toHaveLength(2);
      expect(row.response?.metadata?.redteamHistory).toHaveLength(2);
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      [false, true].flatMap((inline) =>
        [false, true].map((ended) => ({ strategy, inline, ended })),
      ),
    ),
  )(
    '$strategy keeps fallback or STOP JSON with inline=$inline ended=$ended',
    async ({ strategy, inline, ended }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const { target } = createTarget([100, ended ? 101 : 100], { ended });
      const row = await evaluate(createAttack(strategy, 2), target, [assertion]);

      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(observations).toEqual(ended ? [100, 101] : [100, 100, 100]);
      expect(row.success).toBe(!ended);
      expect(row.failureReason).toBe(ended ? 1 : 0);
      if (ended) {
        expect(row.response?.metadata?.stopReason).toBe('Target ended conversation');
      }
    },
  );

  it.each(strategies.flatMap((strategy) => [false, true].map((inline) => ({ strategy, inline }))))(
    '$strategy normalizes selected error audio with inline=$inline',
    async ({ strategy, inline }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const { target, responses } = createTarget([100, 101], { audio: true });
      responses[1].error = 'Synthetic terminal target error';
      const originalResponses = structuredClone(responses);
      const row = await evaluate(createAttack(strategy, 2), target, [assertion]);

      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(observations).toEqual([100]);
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(2);
      expect(row.error).toBe('Synthetic terminal target error');
      await expectSelectedAudio(row.response, originalResponses[1], inline);
      // Hydra's target-error branch already bypassed output extraction before this change.
      expect(row.response?.output).toEqual(
        inline || strategy === 'hydra' || strategy === 'goblin'
          ? originalResponses[1].output
          : expect.stringMatching(/^promptfoo:\/\/blob\//),
      );
      expect(responses).toEqual(originalResponses);
      expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    },
  );

  it.each(
    (['custom', 'crescendo'] as const).flatMap((strategy) =>
      [false, true].map((inline) => ({ strategy, inline })),
    ),
  )(
    '$strategy keeps flagged audio after a later target error with inline=$inline',
    async ({ strategy, inline }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const { target, responses } = createTarget([101, 100], { audio: true });
      responses[1].error = 'Synthetic later target error';
      const originalResponses = structuredClone(responses);
      const row = await evaluate(createAttack(strategy, 2, true), target, [assertion]);

      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(observations).toEqual([101, 101]);
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(1);
      expect(row.response?.error).toBeUndefined();
      expect(row.response?.metadata?.storedGraderResult.pass).toBe(false);
      await expectSelectedAudio(row.response, originalResponses[0], inline);
      expect(row.response?.output).toEqual(
        inline ? originalResponses[0].output : expect.stringMatching(/^promptfoo:\/\/blob\//),
      );
      expect(responses).toEqual(originalResponses);
      expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    },
  );

  it.each(strategies.flatMap((strategy) => [false, true].map((inline) => ({ strategy, inline }))))(
    '$strategy rejects object-origin media JSON with inline=$inline',
    async ({ strategy, inline }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const { target } = createTarget([100], { object: true });
      const row = await evaluate(createAttack(strategy), target, [numericAssertion]);

      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(2);
      expect(row.error).toContain('requires raw JSON text');
      expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    },
  );

  it.each(
    (['hydra', 'goblin'] as const).flatMap((strategy) =>
      [false, true].flatMap((inline) =>
        ['', '   '].map((output) => ({ strategy, inline, output })),
      ),
    ),
  )(
    '$strategy retains empty numeric source text with inline=$inline output="$output"',
    async ({ strategy, inline, output }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const target: ApiProvider = {
        id: () => 'synthetic-empty-calculator',
        callApi: vi.fn(async () => ({ output })),
      };
      const row = await evaluate(createAttack(strategy), target, [numericAssertion]);

      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(row.failureReason).toBe(1);
      expect(row.success).toBe(false);
      expect(row.response?.output).toBe(output);
      expect(row.response?.metadata?.redteamOutputIsText).toBe(true);
      expect(row.response?.metadata?.storedGraderResult.pass).toBe(false);
      expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    },
  );

  it.each(strategies)('%s keeps mixed legacy grading on normalized output', async (strategy) => {
    vi.mocked(RedteamGraderBase.prototype.getResult).mockResolvedValue({
      grade: { pass: true, score: 1, reason: 'Synthetic legacy grade' },
      rubric: 'Check the calculation',
    });
    const { target } = createTarget([100]);
    const row = await evaluate(createAttack(strategy), target, [legacyAssertion, assertion]);

    expect(row.success).toBe(true);
    expect(observations).toEqual([100]);
    expect(RedteamGraderBase.prototype.getResult).toHaveBeenCalled();
    for (const call of vi.mocked(RedteamGraderBase.prototype.getResult).mock.calls) {
      expect(call[1]).toMatch(/^promptfoo:\/\/blob\//);
    }
    expect(row.response?.output).toMatch(/^promptfoo:\/\/blob\//);
  });

  it.each(['custom', 'crescendo'] as const)(
    '%s replaces selected raw output after mixed-mode unblocking',
    async (strategy) => {
      vi.mocked(shared.tryUnblocking).mockResolvedValue({
        success: true,
        unblockingPrompt: 'Return the amount',
      });
      vi.mocked(RedteamGraderBase.prototype.getResult).mockResolvedValue({
        grade: { pass: true, score: 1, reason: 'Synthetic legacy grade' },
        rubric: 'Check the calculation',
      });
      const { target } = createTarget([101, 100]);
      const row = await evaluate(createAttack(strategy), target, [legacyAssertion, assertion]);

      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(observations).toEqual([100]);
      expect(row.success).toBe(true);
      expect(row.failureReason).toBe(0);
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      [false, true].flatMap((inline) => [100, 101].map((amount) => ({ strategy, inline, amount }))),
    ),
  )(
    '$strategy preserves numeric-disabled replay provenance with inline=$inline amount=$amount',
    async ({ strategy, inline, amount }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const { target, responses } = createTarget([amount]);
      const attack = createAttack(strategy);
      const row = await evaluate(attack, target, [
        {
          type: 'javascript',
          value: inline
            ? `JSON.parse(output).amount === ${amount}`
            : 'output.startsWith("promptfoo://blob/")',
        },
      ]);

      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(row.success).toBe(true);
      expect(row.response?.output).toEqual(
        inline ? responses[0].output : expect.stringMatching(/^promptfoo:\/\/blob\//),
      );
      expect(row.response?.metadata?.redteamTargetMetadata).toBeUndefined();
      expect(row.response?.metadata?.redteamOutputIsText).toBe(inline);
      expect(row.metadata?.redteamOutputIsText).toBe(inline);

      for (const response of [row.response!, JSON.parse(JSON.stringify(row.response))]) {
        const replay = runAssertion({
          prompt: 'Return an amount as JSON',
          assertion: numericAssertion,
          providerResponse: response,
          test: { provider: attack.id() },
        });
        if (inline) {
          expect(await replay).toMatchObject({
            pass: amount === 100,
            score: amount === 100 ? 1 : 0,
          });
        } else {
          await expect(replay).rejects.toThrow(/requires raw JSON text/);
          // Rebuilding plausible JSON cannot restore the lost source provenance.
          await expect(
            runAssertion({
              prompt: 'Return an amount as JSON',
              assertion: { ...numericAssertion, transform: 'JSON.stringify({ amount: 100 })' },
              providerResponse: response,
              test: { provider: attack.id() },
            }),
          ).rejects.toThrow(/requires raw JSON text/);
        }
      }
      expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    },
  );
});
