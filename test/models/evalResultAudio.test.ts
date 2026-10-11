import { randomUUID } from 'node:crypto';

import { dump, load } from 'js-yaml';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetBlobStorageProvider, setBlobStorageProvider } from '../../src/blobs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult, { externalizeResultMetadata } from '../../src/models/evalResult';
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
});
