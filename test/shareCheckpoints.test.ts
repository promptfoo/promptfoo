import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlobStorageProvider, isBlobAllowedForShare, storeBlob } from '../src/blobs';
import { cloudConfig } from '../src/globalConfig/cloud';
import { runDbMigrations } from '../src/migrate';
import Eval from '../src/models/eval';
import EvalResult from '../src/models/evalResult';
import { createShareableUrl } from '../src/share';
import { createEvaluateResult } from './factories/eval';

import type { EnvOverrides, EvaluateResult } from '../src/types';

const host = 'https://share.fixture.test';
const firstBytes = Buffer.alloc(2048, 65);
const lastBytes = Buffer.alloc(2048, 66);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
type Copies = 'both' | 'response-only' | 'result-only';
type Request = { url: string; body: unknown };

describe('sharing interrupted checkpoints', () => {
  let requests: Request[];
  let unexpectedUrls: string[];

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    requests = [];
    unexpectedUrls = [];
    vi.stubEnv('PROMPTFOO_DISABLE_SHARE_EMAIL_REQUEST', 'true');
    vi.stubEnv('PROMPTFOO_API_KEY', 'synthetic-only-key');
    vi.spyOn(cloudConfig, 'getApiHost').mockReturnValue(host);
    vi.spyOn(cloudConfig, 'getAppUrl').mockReturnValue(host);
    vi.spyOn(cloudConfig, 'getAuthHeaders').mockReturnValue({
      Authorization: 'Bearer synthetic-only-key',
    });
    vi.spyOn(cloudConfig, 'getCurrentTeamId').mockReturnValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, options: RequestInit = {}) => {
        const target = String(url);
        let bytes = Buffer.from((options.body ?? '') as string);
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
          bytes = gunzipSync(bytes);
        }
        const body = bytes.length ? JSON.parse(bytes.toString()) : null;
        requests.push({ url: target, body });
        if (options.method === 'POST' && target === `${host}/api/blobs`) {
          const data = Buffer.from(body.data, 'base64');
          const digest = hash(data);
          return Response.json({
            ref: {
              hash: digest,
              uri: `promptfoo://blob/${digest}`,
              mimeType: body.mimeType,
              sizeBytes: data.length,
              provider: 'cloud',
            },
          });
        }
        if (options.method === 'POST' && target.startsWith(host) && target.endsWith('/results')) {
          return Response.json(Array.isArray(body) ? {} : { id: 'remote-checkpoint' });
        }
        if (options.method === 'POST' && target === `${host}/api/eval`) {
          return Response.json({ id: 'remote-checkpoint' });
        }
        unexpectedUrls.push(target);
        throw new Error('Unexpected request in isolated share test');
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function createCheckpoint(
    copies: Copies = 'both',
    env?: EnvOverrides,
    earlier = firstBytes,
  ) {
    const first = {
      output: 'first output',
      turns: [{ output: 'first turn', audio: { data: earlier.toString('base64'), format: 'wav' } }],
    };
    const last = {
      output: 'last output',
      audio: { data: lastBytes.toString('base64'), format: 'wav' },
    };
    const metadata = {
      interruptedStrategy: true,
      completedTargetResponses: [
        { prompt: 'first prompt', response: first },
        { prompt: 'last prompt', response: last },
      ],
    };
    const input = createEvaluateResult({
      response: {
        ...last,
        metadata: copies === 'result-only' ? { replacedByHook: true } : metadata,
      },
      metadata: copies === 'response-only' ? { replacedByHook: true } : metadata,
    });
    const record = await Eval.create(
      { env, sharing: { apiBaseUrl: host, appBaseUrl: host } },
      [input.prompt],
      { id: randomUUID() },
    );
    record.author = 'synthetic@example.test';
    const row = await EvalResult.createFromEvaluateResult(record.id, input);
    return { record, row };
  }

  function sentRow(): EvaluateResult {
    const request = requests.find(({ body }) => Array.isArray(body));
    expect(request).toBeDefined();
    expect(request!.body).toHaveLength(1);
    return (request!.body as EvaluateResult[])[0];
  }

  function uploads() {
    return requests
      .filter(({ url }) => url === `${host}/api/blobs`)
      .map(({ body }) => {
        const upload = body as {
          data: string;
          context: { promptIdx: number; testIdx: number; evalId: string };
        };
        return { ...upload.context, hash: hash(Buffer.from(upload.data, 'base64')) };
      });
  }

  describe.each([false, true])('Cloud=%s', (cloud) => {
    beforeEach(() => {
      vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(cloud);
    });

    it.each(['both', 'response-only', 'result-only'] as const)(
      'preserves distinct earlier-turn audio with %s checkpoint copies',
      async (copies) => {
        const { record, row } = await createCheckpoint(copies);
        expect(hash(firstBytes)).not.toBe(hash(lastBytes));
        expect(await isBlobAllowedForShare(hash(firstBytes), record.id)).toBe(true);
        expect(await isBlobAllowedForShare(hash(lastBytes), record.id)).toBe(true);
        const original = structuredClone(row.response);
        expect(await createShareableUrl(record, { silent: true })).toBeTruthy();
        const sent = sentRow();
        for (const metadata of [sent.response!.metadata, sent.metadata]) {
          if (metadata?.interruptedStrategy) {
            const audio = metadata.completedTargetResponses[0].response.turns[0].audio;
            if (cloud) {
              expect(audio.blobRef.hash).toBe(hash(firstBytes));
            } else {
              expect(audio.data).toBe(firstBytes.toString('base64'));
              expect(audio.blobRef).toBeUndefined();
            }
          }
        }
        if (cloud) {
          expect(
            uploads()
              .map((upload) => upload.hash)
              .sort(),
          ).toEqual([hash(firstBytes), hash(lastBytes)].sort());
          for (const upload of uploads()) {
            expect(upload).toMatchObject({ evalId: 'remote-checkpoint', promptIdx: 0, testIdx: 0 });
          }
        } else {
          expect(sent.response!.audio!.data).toBe(lastBytes.toString('base64'));
          expect(uploads()).toEqual([]);
        }
        expect(row.response).toEqual(original);
        expect(unexpectedUrls).toEqual([]);
      },
    );

    it('strips checkpoint output before reading or sending its media', async () => {
      const { record } = await createCheckpoint('both', {
        PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true',
      });
      await createShareableUrl(record, { silent: true });
      const sent = sentRow();
      expect(JSON.stringify(sent)).not.toContain('promptfoo://blob/');
      expect(JSON.stringify(sent)).not.toContain(firstBytes.toString('base64'));
      expect(uploads()).toEqual([]);
      expect(sent.metadata!.completedTargetResponses[0].prompt).toBe('first prompt');
    });

    it('does not share a checkpoint reference copied from another eval', async () => {
      const owner = await createCheckpoint();
      const { record, row } = await createCheckpoint();
      const foreign = await storeBlob(Buffer.alloc(2048, 67), 'audio/wav', {
        evalId: owner.record.id,
        kind: 'audio',
      });
      for (const metadata of [row.response!.metadata!, row.metadata]) {
        metadata.completedTargetResponses[0].response.turns[0].audio = { blobRef: foreign.ref };
      }
      await row.save();
      expect(await isBlobAllowedForShare(foreign.ref.hash, record.id)).toBe(false);
      await createShareableUrl(record, { silent: true });
      for (const metadata of [sentRow().response!.metadata!, sentRow().metadata!]) {
        const audio = metadata.completedTargetResponses[0].response.turns[0].audio;
        expect(audio.blobRef.hash).toBe(foreign.ref.hash);
        expect(audio.data).toBeUndefined();
      }
      expect(uploads().some((upload) => upload.hash === foreign.ref.hash)).toBe(false);
    });

    it('preserves generic depth and string bounds outside checkpoint media', async () => {
      const { record, row } = await createCheckpoint();
      const deep = await storeBlob(Buffer.alloc(2048, 68), 'audio/wav', {
        evalId: record.id,
        kind: 'audio',
      });
      let unrelated: unknown = { audio: { blobRef: deep.ref } };
      for (let i = 0; i < 12; i++) {
        unrelated = { child: unrelated };
      }
      row.metadata.unrelated = unrelated;
      const longOutput = 'ordinary model text '.repeat(10_000) + deep.ref.uri;
      row.metadata.completedTargetResponses[0].response.output = longOutput;
      await row.save();
      await createShareableUrl(record, { silent: true });
      expect(sentRow().metadata!.unrelated).toEqual(unrelated);
      expect(sentRow().metadata!.completedTargetResponses[0].response.output).toBe(longOutput);
      expect(uploads().some((upload) => upload.hash === deep.ref.hash)).toBe(false);
    });

    it('keeps unmarked and malformed checkpoint metadata on the generic share path', async () => {
      const { record, row } = await createCheckpoint('response-only');
      delete row.response!.metadata!.interruptedStrategy;
      row.metadata = {
        interruptedStrategy: true,
        completedTargetResponses: [null, { response: 'ordinary value' }],
      };
      await row.save();
      await createShareableUrl(record, { silent: true });
      const sent = sentRow();
      expect(sent.response!.metadata!.completedTargetResponses[0].response.turns[0].audio).toEqual({
        format: 'wav',
        blobRef:
          row.response!.metadata!.completedTargetResponses[0].response.turns[0].audio.blobRef,
      });
      expect(sent.metadata).toEqual(row.metadata);
      expect(uploads().some((upload) => upload.hash === hash(firstBytes))).toBe(false);
      expect(unexpectedUrls).toEqual([]);
    });
  });

  it('includes inlined checkpoint bytes when choosing the self-hosted chunk size', async () => {
    vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(false);
    const { record } = await createCheckpoint('both', undefined, Buffer.alloc(128 * 1024, 69));
    const batches = vi.spyOn(record, 'fetchResultsBatched');
    await createShareableUrl(record, { silent: true });
    expect(batches.mock.calls[0][0]).toBe(100);
    expect(batches.mock.calls[1][0]).toBeGreaterThan(0);
    expect(batches.mock.calls[1][0]).toBeLessThanOrEqual(2);
  });

  it.each([
    { rows: 1, entries: 20, afterSample: false },
    { rows: 1, entries: 100, afterSample: false },
    { rows: 20, entries: 1, afterSample: false },
    { rows: 101, entries: 20, afterSample: true },
  ])(
    'reads repeated media once across sample and chunks: %j',
    async ({ rows, entries, afterSample }) => {
      vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(false);
      const input = createEvaluateResult();
      const record = await Eval.create(
        { sharing: { apiBaseUrl: host, appBaseUrl: host } },
        [input.prompt],
        { id: randomUUID() },
      );
      record.author = 'synthetic@example.test';
      const { ref } = await storeBlob(firstBytes, 'audio/wav', {
        evalId: record.id,
        kind: 'audio',
      });
      for (let index = 0; index < rows; index++) {
        const metadata = {
          interruptedStrategy: true,
          completedTargetResponses: Array.from(
            { length: afterSample && index < 100 ? 0 : entries },
            (_, target) => ({
              prompt: `prompt ${target}`,
              response: { output: 'checkpoint output', audio: { blobRef: ref, format: 'wav' } },
            }),
          ),
        };
        await EvalResult.createFromEvaluateResult(record.id, {
          ...input,
          testIdx: index,
          success: false,
          failureReason: 2,
          error: 'Synthetic checkpoint',
          response: { output: 'last text', metadata },
          metadata,
        });
      }
      const reads = vi.spyOn(getBlobStorageProvider(), 'getByHash');
      await createShareableUrl(record, { silent: true });
      expect(reads).toHaveBeenCalledExactlyOnceWith(ref.hash);
      const sent = requests
        .filter(({ body }) => Array.isArray(body))
        .flatMap(({ body }) => body as EvaluateResult[]);
      expect(sent).toHaveLength(rows);
      for (const row of sent) {
        for (const metadata of [row.response!.metadata!, row.metadata!]) {
          for (const target of metadata.completedTargetResponses) {
            expect(target.response.audio.data).toBe(firstBytes.toString('base64'));
            expect(target.response.audio.blobRef).toBeUndefined();
          }
        }
      }
      expect(unexpectedUrls).toEqual([]);
    },
  );
});
