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

import type { EnvOverrides, EvaluateResult, ProviderResponse } from '../src/types';

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

  function nestedMetadata(response: ProviderResponse, depth: number) {
    const wrap = (target: ProviderResponse) => ({
      interruptedStrategy: true,
      completedTargetResponses: [{ prompt: 'nested target prompt', response: target }],
    });
    let metadata = wrap(response);
    for (let level = 1; level < depth; level++) {
      metadata = wrap({ output: `level ${level}`, metadata });
    }
    return metadata;
  }

  function checkpointAtDepth(metadata: NonNullable<EvaluateResult['metadata']>, depth: number) {
    let checkpoint = metadata;
    for (let level = 1; level < depth; level++) {
      checkpoint = checkpoint.completedTargetResponses[0].response.metadata;
    }
    return checkpoint;
  }

  async function createNestedCheckpoint(
    copies: Copies,
    placement: 'response' | 'turn',
    depth: number,
    env?: EnvOverrides,
    earlier = firstBytes,
  ) {
    const fixture = await createCheckpoint(copies, env, earlier);
    const audio = { data: earlier.toString('base64'), format: 'wav' };
    const response = {
      output: 'nested output',
      ...(placement === 'response' ? { audio } : { turns: [{ output: 'nested turn', audio }] }),
      cost: 0.25,
      tokenUsage: { total: 5 },
    };
    const metadata = nestedMetadata(response, depth);
    fixture.row.response = {
      ...fixture.row.response,
      metadata: copies === 'result-only' ? { replacedByHook: true } : metadata,
    };
    fixture.row.metadata = copies === 'response-only' ? { replacedByHook: true } : metadata;
    await fixture.row.save();
    return fixture;
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

    describe.each(['response', 'turn'] as const)('nested %s audio', (placement) => {
      describe.each([3, 5])('depth=%s', (depth) => {
        it.each(['both', 'response-only', 'result-only'] as const)(
          'preserves exact bytes with %s copies',
          async (copies) => {
            const { record, row } = await createNestedCheckpoint(copies, placement, depth);
            const original = {
              response: structuredClone(row.response),
              metadata: structuredClone(row.metadata),
            };
            const storedBeforeShare = await EvalResult.findById(row.id);
            const stored = {
              response: structuredClone(storedBeforeShare!.response),
              metadata: structuredClone(storedBeforeShare!.metadata),
            };
            expect(hash(firstBytes)).not.toBe(hash(lastBytes));
            expect(await isBlobAllowedForShare(hash(firstBytes), record.id)).toBe(true);
            await createShareableUrl(record, { silent: true });
            const sent = sentRow();
            for (const metadata of [sent.response!.metadata!, sent.metadata!]) {
              if (!metadata.interruptedStrategy) {
                continue;
              }
              const target = checkpointAtDepth(metadata, depth).completedTargetResponses[0]
                .response;
              const audio = placement === 'turn' ? target.turns[0].audio : target.audio;
              expect(target).toMatchObject({ cost: 0.25, tokenUsage: { total: 5 } });
              if (cloud) {
                expect(audio.blobRef.hash).toBe(hash(firstBytes));
              } else {
                expect(audio.data).toBe(firstBytes.toString('base64'));
                expect(audio.blobRef).toBeUndefined();
              }
            }
            if (cloud) {
              expect(
                uploads()
                  .map(({ hash }) => hash)
                  .sort(),
              ).toEqual([hash(firstBytes), hash(lastBytes)].sort());
            }
            expect(row.response).toEqual(original.response);
            expect(row.metadata).toEqual(original.metadata);
            const saved = await EvalResult.findById(row.id);
            expect(saved!.response).toEqual(stored.response);
            expect(saved!.metadata).toEqual(stored.metadata);
            expect(unexpectedUrls).toEqual([]);
          },
        );
      });
    });

    it.each([
      { stripPrompt: false, stripOutput: false },
      { stripPrompt: true, stripOutput: false },
      { stripPrompt: false, stripOutput: true },
      { stripPrompt: true, stripOutput: true },
    ])('applies flags before nested media reads: %j', async ({ stripPrompt, stripOutput }) => {
      const { record, row } = await createNestedCheckpoint('both', 'turn', 3, {
        PROMPTFOO_STRIP_PROMPT_TEXT: String(stripPrompt),
        PROMPTFOO_STRIP_RESPONSE_OUTPUT: String(stripOutput),
      });
      const input = await storeBlob(Buffer.alloc(2048, 71), 'image/png', {
        evalId: record.id,
        kind: 'image',
      });
      for (const metadata of [row.response!.metadata!, row.metadata]) {
        checkpointAtDepth(metadata, 3).completedTargetResponses[0].prompt = input.ref.uri;
      }
      await row.save();
      const reads = vi.spyOn(getBlobStorageProvider(), 'getByHash');
      await createShareableUrl(record, { silent: true });
      expect(reads.mock.calls.some(([digest]) => digest === hash(firstBytes))).toBe(!stripOutput);
      expect(reads.mock.calls.some(([digest]) => digest === input.ref.hash)).toBe(!stripPrompt);
      const sent = JSON.stringify(sentRow());
      expect(sent.includes(firstBytes.toString('base64'))).toBe(!cloud && !stripOutput);
      expect(uploads().some(({ hash: digest }) => digest === hash(firstBytes))).toBe(
        cloud && !stripOutput,
      );
      expect(uploads().some(({ hash: digest }) => digest === input.ref.hash)).toBe(
        cloud && !stripPrompt,
      );
      expect(unexpectedUrls).toEqual([]);
    });

    it('does not authorize a deeply nested reference from another eval', async () => {
      const owner = await createCheckpoint();
      const { record, row } = await createNestedCheckpoint('both', 'response', 3);
      const foreign = await storeBlob(Buffer.alloc(2048, 72), 'audio/wav', {
        evalId: owner.record.id,
        kind: 'audio',
      });
      for (const metadata of [row.response!.metadata!, row.metadata]) {
        const target = checkpointAtDepth(metadata, 3).completedTargetResponses[0].response;
        target.audio = { blobRef: foreign.ref };
        target.metadata = { evalId: owner.record.id };
      }
      await row.save();
      expect(await isBlobAllowedForShare(foreign.ref.hash, record.id)).toBe(false);
      const reads = vi.spyOn(getBlobStorageProvider(), 'getByHash');
      await createShareableUrl(record, { silent: true });
      expect(reads.mock.calls.some(([digest]) => digest === foreign.ref.hash)).toBe(false);
      expect(uploads().some(({ hash }) => hash === foreign.ref.hash)).toBe(false);
      const audio = checkpointAtDepth(sentRow().metadata!, 3).completedTargetResponses[0].response
        .audio;
      expect(audio.blobRef).toEqual(foreign.ref);
      expect(audio.data).toBeUndefined();
    });

    it('keeps unrelated deep values and turn metadata outside new roots', async () => {
      const { record, row } = await createNestedCheckpoint('both', 'response', 3);
      const ignored = await storeBlob(Buffer.alloc(2048, 73), 'audio/wav', {
        evalId: record.id,
        kind: 'audio',
      });
      let deep: unknown = { audio: { blobRef: ignored.ref } };
      for (let level = 0; level < 12; level++) {
        deep = { child: deep };
      }
      const longText = 'ordinary text '.repeat(10_000) + ignored.ref.uri;
      for (const metadata of [row.response!.metadata!, row.metadata]) {
        const target = checkpointAtDepth(metadata, 3).completedTargetResponses[0].response;
        target.metadata = { unrelated: deep };
        target.output = longText;
        target.turns = [{ metadata: nestedMetadata({ audio: { blobRef: ignored.ref } }, 3) }];
      }
      await row.save();
      const reads = vi.spyOn(getBlobStorageProvider(), 'getByHash');
      await createShareableUrl(record, { silent: true });
      expect(reads.mock.calls.some(([digest]) => digest === ignored.ref.hash)).toBe(false);
      expect(uploads().some(({ hash }) => hash === ignored.ref.hash)).toBe(false);
      const target = checkpointAtDepth(sentRow().metadata!, 3).completedTargetResponses[0].response;
      expect(target.metadata.unrelated).toEqual(deep);
      expect(target.output).toBe(longText);
      expect(
        checkpointAtDepth(target.turns[0].metadata, 3).completedTargetResponses[0].response.audio
          .blobRef,
      ).toEqual(ignored.ref);
    });

    it.each([false, true])('strips malformed output while stripPrompt=%s', async (stripPrompt) => {
      const { record, row } = await createCheckpoint('both', {
        PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true',
        PROMPTFOO_STRIP_PROMPT_TEXT: String(stripPrompt),
      });
      const output = await storeBlob(firstBytes, 'image/png', { evalId: record.id, kind: 'image' });
      const input = await storeBlob(lastBytes, 'image/png', { evalId: record.id, kind: 'image' });
      const metadata = {
        interruptedStrategy: true,
        completedTargetResponses: [
          { prompt: 'legacy prompt', response: output.ref.uri },
          { prompt: input.ref.uri, response: { output: 'valid response' } },
        ],
      };
      row.response = { output: 'text', metadata };
      row.metadata = metadata;
      await row.save();
      const original = structuredClone(row.response);
      const storage = await getBlobStorageProvider();
      const reads = vi.spyOn(storage, 'getByHash');
      await createShareableUrl(record, { silent: true });
      const sent = sentRow();
      expect(JSON.stringify(sent)).not.toContain(output.ref.uri);
      expect(JSON.stringify(sent)).not.toContain(firstBytes.toString('base64'));
      expect(reads.mock.calls.some(([value]) => value === output.ref.hash)).toBe(false);
      expect(reads.mock.calls.some(([value]) => value === input.ref.hash)).toBe(!stripPrompt);
      if (cloud) {
        expect(uploads().map(({ hash }) => hash)).toEqual(stripPrompt ? [] : [input.ref.hash]);
      } else {
        expect(JSON.stringify(sent).includes(lastBytes.toString('base64'))).toBe(!stripPrompt);
      }
      expect(row.response).toEqual(original);
      expect(unexpectedUrls).toEqual([]);
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

  it('counts deeply inlined bytes in the same sample used for chunk sizing', async () => {
    vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(false);
    const { record } = await createNestedCheckpoint(
      'both',
      'response',
      3,
      undefined,
      Buffer.alloc(128 * 1024, 74),
    );
    const batches = vi.spyOn(record, 'fetchResultsBatched');
    await createShareableUrl(record, { silent: true });
    expect(batches.mock.calls[0][0]).toBe(100);
    expect(batches.mock.calls[1][0]).toBeGreaterThan(0);
    expect(batches.mock.calls[1][0]).toBeLessThanOrEqual(2);
  });

  it('keeps Cloud upload provenance for each row containing nested media', async () => {
    vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(true);
    const { record, row } = await createNestedCheckpoint('both', 'response', 3);
    await EvalResult.createFromEvaluateResult(
      record.id,
      createEvaluateResult({
        testIdx: 1,
        promptIdx: 0,
        response: structuredClone(row.response)!,
        metadata: structuredClone(row.metadata),
      }),
    );
    const reads = vi.spyOn(getBlobStorageProvider(), 'getByHash');
    await createShareableUrl(record, { silent: true });
    const nestedUploads = uploads()
      .filter(({ hash: digest }) => digest === hash(firstBytes))
      .sort((left, right) => left.testIdx - right.testIdx);
    expect(nestedUploads).toEqual([
      {
        evalId: 'remote-checkpoint',
        promptIdx: 0,
        testIdx: 0,
        hash: hash(firstBytes),
        kind: 'audio',
        location: 'share',
      },
      {
        evalId: 'remote-checkpoint',
        promptIdx: 0,
        testIdx: 1,
        hash: hash(firstBytes),
        kind: 'audio',
        location: 'share',
      },
    ]);
    expect(reads.mock.calls.filter(([digest]) => digest === hash(firstBytes))).toHaveLength(2);
    expect(unexpectedUrls).toEqual([]);
  });

  it.each([
    { rows: 1, afterSample: false },
    { rows: 101, afterSample: true },
  ])(
    'deduplicates nested references across sample and later rows: %j',
    async ({ rows, afterSample }) => {
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
        const metadata = nestedMetadata({ audio: { blobRef: ref } }, 3);
        if (afterSample && index < 100) {
          metadata.completedTargetResponses = [];
        } else {
          const checkpoint = checkpointAtDepth(metadata, 3);
          checkpoint.completedTargetResponses = Array.from({ length: 20 }, (_, target) => ({
            prompt: `nested prompt ${target}`,
            response: { audio: { blobRef: ref } },
          }));
        }
        await EvalResult.createFromEvaluateResult(record.id, {
          ...input,
          testIdx: index,
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
          if (metadata.completedTargetResponses.length > 0) {
            for (const target of checkpointAtDepth(metadata, 3).completedTargetResponses) {
              expect(target.response.audio.data).toBe(firstBytes.toString('base64'));
              expect(target.response.audio.blobRef).toBeUndefined();
            }
          }
        }
      }
      expect(unexpectedUrls).toEqual([]);
    },
  );

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
