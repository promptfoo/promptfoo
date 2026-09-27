import './setup';

import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetBlobStorageProvider, setBlobStorageProvider, storeBlob } from '../../src/blobs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import EvalResult, { asEvaluateResult, getStripFlags } from '../../src/models/evalResult';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { createDeferred, createTempDir, mockProcessEnv, removeTempDir } from '../util/utils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, ProviderResponse, TestSuite } from '../../src/types/index';

describeEvaluator('resuming persisted audio grading', () => {
  let directory: string;
  let storage: FilesystemBlobStorageProvider;
  let restoreEnv: () => void;

  beforeEach(() => {
    directory = createTempDir('grading-resume-media-');
    storage = new FilesystemBlobStorageProvider({ basePath: directory });
    setBlobStorageProvider(storage);
    restoreEnv = mockProcessEnv({ PROMPTFOO_INLINE_MEDIA: 'false' });
  });

  afterEach(() => {
    resetBlobStorageProvider();
    removeTempDir(directory);
    restoreEnv();
    vi.restoreAllMocks();
  });

  it.each(['available', 'SDK grader', 'missing', 'another evaluation'] as const)(
    'replays only evaluation-owned audio: %s',
    async (availability) => {
      const bytes = Buffer.from(randomUUID().repeat(40));
      const data = bytes.toString('base64');
      const controller = new AbortController();
      const started = createDeferred<void>();
      const pending = createDeferred<ProviderResponse>();
      const prompts: string[] = [];
      let resumed = false;
      const callApi = vi.fn(async (prompt: string) => {
        prompts.push(prompt);
        started.resolve();
        return resumed
          ? { output: '{"pass":true,"score":1,"reason":"same audio"}' }
          : pending.promise;
      });
      const grader: ApiProvider =
        availability === 'SDK grader'
          ? new OpenAiChatCompletionProvider('gpt-4o-audio-preview', {
              config: { temperature: 0.2 },
            })
          : {
              id: () => 'offline-audio-grader',
              getAudioInputFormat: () => 'openai',
              callApi,
            };
      if (availability === 'SDK grader') {
        vi.spyOn(grader, 'callApi').mockImplementation(callApi);
      }
      const target: ApiProvider = {
        id: () => 'offline-audio-target',
        callApi: vi.fn(async () => ({
          output: 'synthetic sound',
          audio: { data, format: 'wav', transcript: 'synthetic sound' },
        })),
      };
      const suite: TestSuite = {
        providers: [target],
        prompts: [toPrompt('hello')],
        tests: [{ assert: [{ type: 'llm-rubric', value: 'inspect audio', provider: grader }] }],
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      const initial = evaluate(suite, record, {
        abortSignal: controller.signal,
        maxConcurrency: 1,
        timeoutMs: 0,
        maxEvalTimeMs: 0,
      });
      try {
        await started.promise;
        controller.abort();
        await initial;
        const [saved] = await record.getResults();
        if (!(saved instanceof EvalResult)) {
          throw new Error('Expected a persisted evaluation result');
        }
        expect(saved.gradingResult?.metadata?.__promptfoo).toMatchObject({
          assertionGradingInterrupted: true,
        });
        if (availability === 'SDK grader') {
          expect(saved.testCase.assert).toMatchObject([
            { provider: { modelName: 'gpt-4o-audio-preview', config: { temperature: 0.2 } } },
          ]);
          expect(saved.testCase.assert).toMatchObject([
            { provider: expect.not.objectContaining({ id: expect.anything() }) },
          ]);
        }
        expect(saved.response?.audio?.data).toBeUndefined();
        expect(saved.response?.audio?.blobRef).toBeDefined();
        if (availability === 'missing') {
          await storage.deleteByHash(saved.response!.audio!.blobRef!.hash);
        } else if (availability === 'another evaluation') {
          const other = await Eval.create({}, suite.prompts, { id: randomUUID() });
          const foreign = await storeBlob(Buffer.from(randomUUID().repeat(40)), 'audio/wav', {
            evalId: other.id,
            kind: 'audio',
            location: 'response.audio.data',
          });
          saved.response!.audio!.blobRef = foreign.ref;
          await saved.save();
        }
        resumed = true;
        pending.resolve({ output: '{"pass":false,"score":0,"reason":"late"}' });
        cliState.resume = true;
        const reloaded = await Eval.findById(record.id);
        await evaluate(suite, reloaded!, { maxConcurrency: 1, timeoutMs: 0, maxEvalTimeMs: 0 });
        const [result] = await reloaded!.getResults();
        expect(target.callApi).toHaveBeenCalledTimes(1);
        expect(result.id).toBe(saved.id);
        expect(result.response?.audio?.data).toBeUndefined();
        expect(result.response?.audio?.blobRef).toEqual(saved.response?.audio?.blobRef);
        expect(
          asEvaluateResult(result, getStripFlags({ PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true' }))
            .response,
        ).not.toHaveProperty('audio');
        if (availability === 'available' || availability === 'SDK grader') {
          expect(result).toMatchObject({ success: true, score: 1 });
          expect(prompts).toHaveLength(2);
          expect(prompts[1]).toBe(prompts[0]);
          expect(prompts[1]).toContain(data);
        } else {
          expect(result.success).toBe(false);
          expect(prompts).toHaveLength(1);
          expect(result.error).toBeTruthy();
        }
      } finally {
        pending.resolve({ output: 'late response' });
        controller.abort();
        await initial;
        cliState.resume = false;
      }
    },
  );
});
