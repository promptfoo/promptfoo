import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesystemBlobStorageProvider } from '../../../src/blobs/filesystemProvider';
import {
  getBlobByHash,
  isBlobAllowedForShare,
  resetBlobStorageProvider,
  setBlobStorageProvider,
} from '../../../src/blobs/index';
import { runEval } from '../../../src/evaluator';
import { runDbMigrations } from '../../../src/migrate';
import Eval from '../../../src/models/eval';
import AuthoritativeMarkupInjectionProvider from '../../../src/redteam/providers/authoritativeMarkupInjection';
import BestOfNProvider from '../../../src/redteam/providers/bestOfN';
import IndirectWebPwnProvider from '../../../src/redteam/providers/indirectWebPwn';
import { isProviderResponseRateLimited } from '../../../src/scheduler/types';
import { isResponseHeadersObserverErrorResponse } from '../../../src/util/fetch/responseHeadersObserver';
import { createSelectedObserverErrorResponse } from '../../util/selectedObserverError';
import { mockProcessEnv } from '../../util/utils';

import type { ApiProvider, AtomicTestCase, ProviderResponse } from '../../../src/types/index';

const remoteFetch = vi.hoisted(() => vi.fn());
vi.mock('../../../src/util/fetch/index', async (original) => ({
  ...(await original()),
  fetchWithProxy: (...args: unknown[]) => remoteFetch(...args),
  fetchWithRetries: (...args: unknown[]) => remoteFetch(...args),
}));
vi.mock('../../../src/redteam/remoteGeneration', async (original) => ({
  ...(await original()),
  neverGenerateRemote: () => false,
}));

const prompt = { raw: '{{query}}', label: 'selected error capture' };
const audio = Buffer.alloc(24 * 1024, 7).toString('base64');
const laterAudio = Buffer.alloc(24 * 1024, 8).toString('base64');
const strategies = ['best-of-n', 'authoritative-markup-injection', 'indirect-web-pwn'] as const;

describe('selected error media in single-response strategy wrappers', () => {
  let directory: string;
  let restoreEnv: () => void;

  beforeAll(async () => {
    await runDbMigrations();
  });
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-error-media-'));
    restoreEnv = mockProcessEnv({
      PROMPTFOO_CONFIG_DIR: directory,
      PROMPTFOO_INLINE_MEDIA: 'false',
    });
    setBlobStorageProvider(
      new FilesystemBlobStorageProvider({ basePath: path.join(directory, 'blobs') }),
    );
    remoteFetch.mockReset();
    remoteFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(String(options.body));
      let result: unknown;
      if (body.task === 'jailbreak:best-of-n') {
        result = { modifiedPrompts: ['Return an amount'] };
      } else if (body.task === 'authoritative-markup-injection') {
        result = { message: { role: 'user', content: 'Return an amount' } };
      } else if (body.task === 'create-web-page') {
        const uuid = randomUUID();
        result = {
          uuid,
          fullUrl: `https://example.com/dynamic-pages/${body.evalId}/${uuid}`,
          path: '/synthetic-page',
          fetchPrompt: 'Return an amount',
        };
      } else if (body.task === 'get-web-page-tracking') {
        result = { wasFetched: false, fetchCount: 0 };
      } else {
        throw new Error(`Unexpected synthetic task ${body.task}`);
      }
      return new Response(JSON.stringify(result), { status: 200 });
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
  });
  afterEach(async () => {
    try {
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      resetBlobStorageProvider();
      restoreEnv();
      remoteFetch.mockReset();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it.each(
    (['best-of-n', 'authoritative-markup-injection'] as const).flatMap((strategy) =>
      [false, true].flatMap((inline) =>
        [false, true].map((marked) => ({ strategy, inline, marked })),
      ),
    ),
  )(
    '$strategy preserves selected observer identity through numeric capture storage (inline=$inline, marked=$marked)',
    async ({ strategy, inline, marked }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const provider =
        strategy === 'best-of-n'
          ? new BestOfNProvider({ injectVar: 'query', maxConcurrency: 1 })
          : new AuthoritativeMarkupInjectionProvider({ injectVar: 'query' });
      const original = {
        output: '{"amount":100}',
        error: 'metrics rate limit exceeded',
        metadata: { selectedTurn: 1, audio: { data: audio, format: 'wav' } },
        tokenUsage: { total: 9, numRequests: 1 },
      };
      const selected = marked ? createSelectedObserverErrorResponse(original) : original;
      const target: ApiProvider = {
        id: () => 'synthetic-selected-observer-target',
        callApi: vi.fn(async () => selected),
      };
      const result = await provider.callApi('Return an amount', {
        originalProvider: target,
        prompt,
        vars: { query: 'Return an amount' },
        test: {
          assert: [
            {
              type: 'promptfoo:redteam:financial:calculation-error',
              value: { type: 'numeric', expected: { amount: 100 } },
            },
          ],
        } as AtomicTestCase,
      });
      expect(result.error).toBe(original.error);
      expect(result.output).toBe(original.output);
      expect(result.tokenUsage).toMatchObject(original.tokenUsage);
      expect(result.metadata?.redteamTargetMetadata.selectedTurn).toBe(1);
      const capturedAudio = result.metadata?.redteamTargetMetadata.audio;
      expect(capturedAudio.data).toBe(inline ? audio : undefined);
      if (!inline) {
        expect((await getBlobByHash(capturedAudio.blobRef.hash)).data.toString('base64')).toBe(
          audio,
        );
      }
      expect(isResponseHeadersObserverErrorResponse(result)).toBe(marked);
      expect(isProviderResponseRateLimited(result, undefined)).toBe(!marked);
      expect(isResponseHeadersObserverErrorResponse(JSON.parse(JSON.stringify(result)))).toBe(
        false,
      );
      expect(selected.metadata).toBe(original.metadata);
      expect(original.metadata.audio.data).toBe(audio);
      expect(target.callApi).toHaveBeenCalledOnce();
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      [false, true].flatMap((inline) =>
        [false, true].map((numeric) => ({ strategy, inline, numeric })),
      ),
    ),
  )(
    '$strategy retains only its selected capture with inline=$inline numeric=$numeric',
    async ({ strategy, inline, numeric }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const provider =
        strategy === 'best-of-n'
          ? new BestOfNProvider({ injectVar: 'query', maxConcurrency: 1 })
          : strategy === 'authoritative-markup-injection'
            ? new AuthoritativeMarkupInjectionProvider({ injectVar: 'query' })
            : new IndirectWebPwnProvider({ injectVar: 'query', maxFetchAttempts: 2 });
      const responses: ProviderResponse[] = [1, 2].map((turn) => ({
        output: '{"amount":100}',
        ...(strategy !== 'indirect-web-pwn' || turn === 2
          ? { error: 'Synthetic target failed' }
          : {}),
        metadata: {
          selectedTurn: turn,
          audio: { data: turn === 1 ? audio : laterAudio, format: 'wav' },
          details: { audio: { data: 'ordinary-domain-data' } },
        },
      }));
      const originals = structuredClone(responses);
      const target: ApiProvider = {
        id: () => 'synthetic-selected-error-target',
        callApi: vi.fn(async () => responses[vi.mocked(target.callApi).mock.calls.length - 1]),
      };
      const record = await Eval.create({}, [prompt], { id: randomUUID(), author: null });
      const test: AtomicTestCase = {
        provider,
        vars: { query: 'Return an amount' },
        assert: numeric
          ? [
              {
                type: 'promptfoo:redteam:financial:calculation-error',
                value: { type: 'numeric', expected: { amount: 100 } },
              },
            ]
          : [{ type: 'contains', value: 'amount' }],
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
        evalId: record.id,
      });
      expect(row.failureReason).toBe(2);
      expect(row.error).toBe('Synthetic target failed');
      expect(target.callApi).toHaveBeenCalledTimes(strategy === 'indirect-web-pwn' ? 2 : 1);
      for (const metadata of [row.response?.metadata, row.metadata]) {
        const capture = metadata?.redteamTargetMetadata;
        if (numeric) {
          expect(capture.selectedTurn).toBe(1);
          expect(capture.details.audio.data).toBe('ordinary-domain-data');
          expect(capture.audio.data).toBe(inline ? audio : undefined);
          if (!inline) {
            expect((await getBlobByHash(capture.audio.blobRef.hash)).data.toString('base64')).toBe(
              audio,
            );
            expect(await isBlobAllowedForShare(capture.audio.blobRef.hash, record.id)).toBe(true);
          }
        } else {
          expect(capture).toBeUndefined();
        }
      }
      // Existing forwarded target metadata on these error responses is unchanged.
      if (strategy !== 'indirect-web-pwn') {
        expect(row.response?.metadata?.audio.data).toBe(audio);
      }
      expect(responses).toEqual(originals);
    },
  );
});
