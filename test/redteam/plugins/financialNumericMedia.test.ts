import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../../src/assertions/index';
import { extractAndStoreBinaryData } from '../../../src/blobs/extractor';
import { FilesystemBlobStorageProvider } from '../../../src/blobs/filesystemProvider';
import {
  getBlobByHash,
  isBlobAllowedForShare,
  resetBlobStorageProvider,
  setBlobStorageProvider,
} from '../../../src/blobs/index';
import cliState from '../../../src/cliState';
import { getDb } from '../../../src/database/index';
import { evalsTable } from '../../../src/database/tables';
import { runEval } from '../../../src/evaluator';
import { runDbMigrations } from '../../../src/migrate';
import EvalResult, { sanitizeResultForJsonlArtifact } from '../../../src/models/evalResult';
import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';
import { snapshotTargetMetadata } from '../../../src/redteam/providers/shared';
import { createEvaluateResult } from '../../factories/eval';
import { mockProcessEnv } from '../../util/utils';

import type { ApiProvider, Assertion, AtomicTestCase } from '../../../src/types/index';

const audioData = Buffer.alloc(24 * 1024, 7).toString('base64');
const prompt = { raw: '{{query}}', label: 'numeric media' };
const numericAssertion: Assertion = {
  type: 'promptfoo:redteam:financial:calculation-error',
  value: { type: 'numeric', expected: { amount: 100 } },
};
const originalMetadata = () => ({
  audio: { data: audioData, format: 'wav', transcript: 'An amount' },
  sessionId: 'selected-session',
  details: { audio: { data: audioData } },
});

describe('captured numeric metadata media lifecycle', () => {
  let directory: string;
  let restoreEnv: () => void;
  let previousBasePath: string | undefined;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-media-'));
    restoreEnv = mockProcessEnv({
      PROMPTFOO_CONFIG_DIR: directory,
      PROMPTFOO_INLINE_MEDIA: 'false',
    });
    previousBasePath = cliState.basePath;
    cliState.basePath = directory;
    setBlobStorageProvider(
      new FilesystemBlobStorageProvider({ basePath: path.join(directory, 'blobs') }),
    );
  });

  afterEach(async () => {
    cliState.basePath = previousBasePath;
    resetBlobStorageProvider();
    restoreEnv();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(
    [false, true].flatMap((inline) =>
      ['test', 'assertion', 'script'].map((stage) => ({ inline, stage })),
    ),
  )('keeps live $stage inputs consistent with inline=$inline', async ({ inline, stage }) => {
    vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
    const metadata = originalMetadata();
    let targetCalls = 0;
    const target: ApiProvider = {
      id: () => 'synthetic-audio-target',
      callApi: async () => ({
        output: JSON.stringify({ amount: ++targetCalls === 1 ? 100 : 101 }),
        metadata,
      }),
    };
    const observations: boolean[] = [];
    const transform: NonNullable<Assertion['transform']> = (output, context) => {
      const audio = context.metadata?.audio as { data?: unknown } | undefined;
      const hasAudio = audio?.data === audioData;
      observations.push(hasAudio);
      return hasAudio ? output : '{"amount":999}';
    };
    const assertion: Assertion = {
      ...numericAssertion,
      ...(stage === 'assertion' ? { transform } : {}),
    };
    if (stage === 'script') {
      await fs.writeFile(
        path.join(directory, 'reference.cjs'),
        'module.exports = (_output, context) => ({ type: "numeric", expected: { amount: typeof context.metadata?.audio?.data === "string" && context.metadata.audio.data === context.providerResponse.metadata?.audio?.data ? 100 : 999 } });',
      );
      assertion.value = 'file://reference.cjs';
      assertion.config = { numeric: true };
    }
    const strategy: ApiProvider = {
      id: () => 'promptfoo:redteam:iterative:meta',
      callApi: (_prompt, context) =>
        runMetaAgentRedteam({
          context,
          prompt: context!.prompt,
          filters: undefined,
          vars: context!.vars,
          test: context!.test as AtomicTestCase,
          targetProvider: target,
          gradingProvider: target,
          injectVar: 'query',
          numIterations: 2,
          agentProvider: {
            id: () => 'synthetic-attacker',
            callApi: async () => ({ output: { result: 'Return an amount' } }),
          },
        }),
    };
    const test: AtomicTestCase = {
      provider: strategy,
      vars: { query: 'Return an amount' },
      assert: [assertion],
      ...(stage === 'test' ? { options: { transform } } : {}),
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
      evaluateOptions: {},
      conversations: {},
      registers: {},
      isRedteam: true,
    });
    expect(targetCalls).toBe(2);
    if (stage !== 'script') {
      expect(observations).toEqual([true, true, true]);
    }
    expect(row.response?.output).toBe('{"amount":101}');
    expect(row.response?.metadata?.storedGraderResult.pass).toBe(false);
    expect(row.success).toBe(false);
    expect(row.failureReason).toBe(1);
    expect(metadata.audio.data).toBe(audioData);
    for (const copy of [row.response?.metadata, row.metadata]) {
      const audio = copy?.redteamTargetMetadata.audio;
      if (inline) {
        expect(audio.data).toBe(audioData);
      } else {
        expect(audio.data).toBeUndefined();
        expect((await getBlobByHash(audio.blobRef.hash)).data.toString('base64')).toBe(audioData);
      }
    }
    vi.unstubAllEnvs();
  });

  it.each(
    [false, true].flatMap((inline) =>
      ['single', 'batch', 'memory', 'save-insert', 'save-update'].map((boundary) => ({
        inline,
        boundary,
      })),
    ),
  )(
    'projects both stored copies at $boundary with inline=$inline',
    async ({ inline, boundary }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const targetMetadata = originalMetadata();
      const metadata = { redteamTargetMetadata: targetMetadata, redteamOutputIsText: true };
      const evalId = `numeric-media-${crypto.randomUUID()}`;
      const db = await getDb();
      await db.insert(evalsTable).values({ id: evalId, config: {}, results: {} });
      const test: AtomicTestCase = {
        provider: 'promptfoo:redteam:iterative:meta',
        assert: [numericAssertion],
      };
      const input = createEvaluateResult({
        prompt,
        testCase: test,
        response: { output: '{"amount":100}', metadata },
        metadata,
      });
      const result =
        boundary === 'batch'
          ? (await EvalResult.createManyFromEvaluateResult([input], evalId))[0]
          : await EvalResult.createFromEvaluateResult(evalId, input, {
              persist: boundary === 'single' || boundary === 'save-update',
            });
      if (boundary.startsWith('save-')) {
        result.response = input.response;
        result.metadata = metadata;
        await result.save();
        expect(result.response?.metadata?.redteamTargetMetadata).toBe(targetMetadata);
      }
      const saved = boundary === 'memory' ? result : (await EvalResult.findById(result.id))!;
      const row = saved.toEvaluateResult();
      for (const copy of [row.response?.metadata, row.metadata]) {
        const captured = copy?.redteamTargetMetadata;
        expect(captured.sessionId).toBe('selected-session');
        expect(captured.details.audio.data).toBe(audioData); // Ordinary nested domain metadata.
        if (inline) {
          expect(captured.audio.data).toBe(audioData);
        } else {
          expect(captured.audio.data).toBeUndefined();
          expect(captured.audio.blobRef.uri).toMatch(/^promptfoo:\/\/blob\//);
          expect((await getBlobByHash(captured.audio.blobRef.hash)).data.toString('base64')).toBe(
            audioData,
          );
          expect(await isBlobAllowedForShare(captured.audio.blobRef.hash, evalId)).toBe(true);
        }
      }
      expect(row.response?.metadata?.redteamTargetMetadata.audio).toEqual(
        row.metadata?.redteamTargetMetadata.audio,
      );
      for (const strip of [false, true]) {
        const flags = {
          shouldStripPromptText: false,
          shouldStripResponseOutput: strip,
          shouldStripTestVars: false,
          shouldStripGradingResult: false,
          shouldStripMetadata: false,
        };
        const projected = sanitizeResultForJsonlArtifact(row, flags);
        for (const copy of [projected.response?.metadata, projected.metadata]) {
          const captured = copy?.redteamTargetMetadata;
          expect(captured.audio === undefined).toBe(strip);
          expect(captured.details.audio.data).toBe(audioData);
        }
      }
      // Saved replay uses the stored blob representation; numeric values/provenance remain valid.
      const replay = await runAssertion({
        assertion: numericAssertion,
        prompt: 'Return an amount',
        test,
        providerResponse: row.response!,
      });
      expect(replay.pass).toBe(true);
      const representation = await runAssertion({
        assertion: {
          type: 'javascript',
          value: inline
            ? 'typeof context.metadata.audio.data === "string"'
            : 'context.metadata.audio.data === undefined && context.metadata.audio.blobRef.uri.startsWith("promptfoo://blob/")',
        },
        test,
        providerResponse: row.response!,
      });
      expect(representation.pass).toBe(true);
      expect(targetMetadata.audio.data).toBe(audioData);
      expect(input.response?.metadata?.redteamTargetMetadata).toBe(targetMetadata);
      vi.unstubAllEnvs();
    },
  );

  it('does not create a numeric capture when numeric mode is disabled', async () => {
    const response = { output: '{"amount":100}', metadata: originalMetadata() };
    expect(
      snapshotTargetMetadata(response, { assert: [{ type: 'equals', value: response.output }] }),
    ).toBeUndefined();
    const extracted = await extractAndStoreBinaryData(response);
    expect(extracted?.metadata).not.toHaveProperty('redteamTargetMetadata');
    expect(extracted?.metadata?.audio.data).toBeUndefined();
    expect(extracted?.metadata?.audio.blobRef).toBeDefined();
    expect(response.metadata.audio.data).toBe(audioData);
  });
});
