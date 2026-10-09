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
