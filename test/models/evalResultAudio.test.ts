import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import express from 'express';
import { dump, load } from 'js-yaml';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetBlobStorageProvider, setBlobStorageProvider } from '../../src/blobs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import { getDb } from '../../src/database';
import { blobReferencesTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult, { externalizeResultMetadata } from '../../src/models/evalResult';
import { blobsRouter } from '../../src/server/routes/blobs';
import { sha256 } from '../../src/util/createHash';
import { createEvaluateResult } from '../factories/eval';
import { createTempDir, mockProcessEnv, removeTempDir } from '../util/utils';

// A source recording is mirrored at result level before provider media is stored.
// A multi-megabyte unbroken base64 scalar also reproduces the YAML export failure.
const bytes = Buffer.alloc(1_650_000, 127);
const sourceAudio = {
  data: bytes.toString('base64'),
  format: 'wav',
  role: 'target_source',
  clock: 'source_sample_order',
};
const unrelatedDataUrl = `data:image/png;base64,${Buffer.alloc(2048, 42).toString('base64')}`;
const app = express().use('/api/blobs', blobsRouter);

describe('result metadata audio persistence', () => {
  let directory: string;
  let storage: FilesystemBlobStorageProvider;
  let restoreEnv: () => void;

  beforeAll(async () => {
    await runDbMigrations();
  });
  beforeEach(() => {
    directory = createTempDir('result-audio-');
    storage = new FilesystemBlobStorageProvider({ basePath: directory });
    setBlobStorageProvider(storage);
    restoreEnv = mockProcessEnv({ PROMPTFOO_INLINE_MEDIA: 'false' });
  });
  afterEach(() => {
    restoreEnv();
    resetBlobStorageProvider();
    removeTempDir(directory);
  });

  it.each(['single', 'batch', 'memory'] as const)(
    'externalizes a legacy inline mirror through the %s boundary without losing audio or metadata',
    async (boundary) => {
      const evaluation = await Eval.create({}, [], { id: `eval-audio-${randomUUID()}` });
      const canonical = (await storage.store(bytes, 'audio/wav')).ref;
      const input = createEvaluateResult({
        response: {
          output: 'partial voice response',
          error: 'capture ended',
          metadata: { audio: { ...sourceAudio, data: undefined, blobRef: canonical } },
        },
        metadata: {
          audio: sourceAudio,
          note: 'keep unrelated test metadata',
          unrelated: {
            image: unrelatedDataUrl,
          },
        },
        success: false,
      });
      const result =
        boundary === 'batch'
          ? (await EvalResult.createManyFromEvaluateResult([input], evaluation.id))[0]
          : await EvalResult.createFromEvaluateResult(evaluation.id, input, {
              persist: boundary !== 'memory',
            });
      const stored = boundary === 'memory' ? result : await EvalResult.findById(result.id);
      expect(stored).not.toBeNull();
      const row = stored!.toEvaluateResult();
      expect(row.metadata?.audio).toMatchObject({
        role: 'target_source',
        clock: 'source_sample_order',
        blobRef: { hash: sha256(bytes) },
      });
      expect(row.metadata?.audio.data).toBeUndefined();
      expect(row.response?.metadata?.audio.blobRef.hash).toBe(sha256(bytes));
      expect(row.metadata?.note).toBe('keep unrelated test metadata');
      expect(row.metadata?.unrelated).toEqual({ image: unrelatedDataUrl });
      expect((await storage.getByHash(row.metadata!.audio.blobRef.hash)).data).toEqual(bytes);
      expect(input.metadata?.audio.data).toBe(bytes.toString('base64'));
      const serialized = dump(row);
      expect(serialized.length).toBeLessThan(20_000);
      expect((load(serialized) as typeof row).metadata?.audio.blobRef.hash).toBe(sha256(bytes));
    },
  );

  it('externalizes both initially inline copies to the same content-addressed blob', async () => {
    const evaluation = await Eval.create({}, [], { id: `eval-audio-${randomUUID()}` });
    const input = createEvaluateResult({
      response: { output: 'voice response', metadata: { audio: sourceAudio } },
      metadata: { audio: sourceAudio },
    });
    const result = await EvalResult.createFromEvaluateResult(evaluation.id, input);
    expect(result.metadata.audio.blobRef.hash).toBe(result.response?.metadata?.audio.blobRef.hash);
    expect(result.response?.metadata?.audio.data).toBeUndefined();
    expect(result.metadata.audio.data).toBeUndefined();
  });

  it.each(
    (['single', 'batch'] as const).flatMap((boundary) =>
      [false, true].map((mirrored) => ({ boundary, mirrored })),
    ),
  )(
    'retains real media-library locations through $boundary persistence, mirrored=$mirrored',
    async ({ boundary, mirrored }) => {
      const evaluation = await Eval.create({}, [], { id: `eval-audio-${randomUUID()}` });
      const heard = Buffer.alloc(2048, 42);
      const input = createEvaluateResult({
        response: mirrored
          ? {
              output: 'heard recording differs from generated source',
              audio: { data: heard.toString('base64'), format: 'wav' },
              metadata: { audio: sourceAudio },
            }
          : { output: 'only result metadata contains audio' },
        metadata: { audio: sourceAudio, note: 'retain this annotation' },
      });
      const stored =
        boundary === 'batch'
          ? (await EvalResult.createManyFromEvaluateResult([input], evaluation.id))[0]
          : await EvalResult.createFromEvaluateResult(evaluation.id, input);
      const sourceHash = sha256(bytes);
      const references = await (await getDb())
        .select({ location: blobReferencesTable.location })
        .from(blobReferencesTable)
        .where(
          and(
            eq(blobReferencesTable.evalId, evaluation.id),
            eq(blobReferencesTable.blobHash, sourceHash),
          ),
        )
        .all();
      expect(references.map((ref) => ref.location).sort()).toEqual(
        mirrored
          ? ['metadata.audio.data', 'response.metadata.audio.data']
          : ['metadata.audio.data'],
      );
      const library = await request(app)
        .get('/api/blobs/library')
        .query({ evalId: evaluation.id, hash: sourceHash });
      expect(library.status).toBe(200);
      expect(library.body.data.items).toHaveLength(1);
      // The library selects the last stored reference, including rowid ties.
      expect(library.body.data.items[0].context.location).toBe(
        mirrored && boundary === 'single' ? 'response.metadata.audio.data' : 'metadata.audio.data',
      );
      expect(stored.metadata.audio.blobRef.hash).toBe(sourceHash);
      expect(stored.metadata.note).toBe('retain this annotation');
      expect((await storage.getByHash(sourceHash)).data).toEqual(bytes);
      expect(input.metadata?.audio.data).toBe(sourceAudio.data);
      if (mirrored) {
        expect(stored.response?.audio?.blobRef?.hash).toBe(sha256(heard));
        expect((await storage.getByHash(sha256(heard))).data).toEqual(heard);
        expect(stored.response?.metadata?.audio.blobRef.hash).toBe(sourceHash);
      } else {
        expect(stored.response?.audio).toBeUndefined();
      }
    },
  );

  it('leaves unrelated metadata unchanged and honors explicit inline-media mode', async () => {
    const evaluation = await Eval.create({}, [], { id: `eval-audio-${randomUUID()}` });
    const unrelated = createEvaluateResult({
      metadata: { audio: { transcript: 'annotation only' }, note: 'kept' },
    });
    expect(await externalizeResultMetadata(unrelated, evaluation.id)).toBe(unrelated.metadata);
    const restoreInline = mockProcessEnv({ PROMPTFOO_INLINE_MEDIA: 'true' });
    try {
      const input = createEvaluateResult({ metadata: { audio: sourceAudio } });
      expect(await externalizeResultMetadata(input, evaluation.id)).toBe(input.metadata);
    } finally {
      restoreInline();
    }
  });

  it('preserves unrelated cyclic metadata for the existing cycle-safe persistence sanitizer', async () => {
    const evaluation = await Eval.create({}, [], { id: `eval-audio-${randomUUID()}` });
    const unrelated: Record<string, unknown> = { note: 'retain this annotation' };
    unrelated.self = unrelated;
    const input = createEvaluateResult({ metadata: { audio: sourceAudio, unrelated } });
    const processed = await externalizeResultMetadata(input, evaluation.id);
    expect(processed?.unrelated).toBe(unrelated);
    const result = await EvalResult.createFromEvaluateResult(evaluation.id, input);
    expect(result.metadata.unrelated.note).toBe('retain this annotation');
    expect(result.metadata.audio.data).toBeUndefined();
    expect(() => JSON.stringify(result.toEvaluateResult())).not.toThrow();
    expect(unrelated.self).toBe(unrelated);
  });

  it.each([123, true, { type: 'wav' }, ['wav'], null, false, undefined])(
    'stores legacy metadata audio with non-string format %j using a safe MIME fallback',
    async (format) => {
      const evaluation = await Eval.create({}, [], { id: `eval-audio-${randomUUID()}` });
      const input = createEvaluateResult({ metadata: { audio: { ...sourceAudio, format } } });
      const saved = await EvalResult.createFromEvaluateResult(evaluation.id, input);
      const result = await EvalResult.findById(saved.id);
      expect(result?.metadata.audio.blobRef).toMatchObject({
        hash: sha256(bytes),
        mimeType: 'audio/wav',
      });
      expect(result?.metadata.audio.format).toEqual(format);
      expect(result?.metadata.audio.data).toBeUndefined();
      expect(input.metadata?.audio.data).toBe(bytes.toString('base64'));
    },
  );
});
