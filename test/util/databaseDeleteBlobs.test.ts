import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getShareAuthorizedBlob,
  resetBlobStorageProvider,
  setBlobStorageProvider,
} from '../../src/blobs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import { importCommand } from '../../src/commands/import';
import { getDb } from '../../src/database';
import { blobReferencesTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { TraceStore } from '../../src/tracing/store';
import { ResultFailureReason } from '../../src/types/index';
import { sha256 } from '../../src/util/createHash';
import { deleteEvalResult } from '../../src/util/database';
import { createOutputData } from '../../src/util/output';
import EvalFactory from '../factories/evalFactory';
import { createTempDir, mockProcessEnv, removeTempDir } from './utils';

import type { EvaluateResult, ProviderResponse } from '../../src/types/index';

vi.mock('../../src/database/signal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/database/signal')>()),
  updateSignalFile: vi.fn(),
  updateSignalFileForDeletedEvals: vi.fn(),
}));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

describe('result deletion blob provenance', () => {
  let directory: string;
  let restoreEnv: () => void;
  const evaluations: Eval[] = [];

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    directory = createTempDir('promptfoo-delete-blob-');
    restoreEnv = mockProcessEnv({ PROMPTFOO_INLINE_MEDIA: 'false' });
    setBlobStorageProvider(new FilesystemBlobStorageProvider({ basePath: directory }));
  });

  afterEach(async () => {
    for (const evaluation of evaluations.splice(0)) {
      await evaluation.delete({ notify: false });
    }
    resetBlobStorageProvider();
    restoreEnv();
    removeTempDir(directory);
    vi.resetAllMocks();
  });

  function result(testIdx: number, response: ProviderResponse): EvaluateResult {
    return {
      promptIdx: 0,
      testIdx,
      testCase: {},
      promptId: 'blob-prompt',
      prompt: { raw: 'blob', label: 'blob' },
      provider: { id: 'test-provider' },
      vars: {},
      response,
      success: true,
      score: 1,
      failureReason: ResultFailureReason.NONE,
      latencyMs: 0,
      cost: 0,
      namedScores: {},
      gradingResult: { pass: true, score: 1, reason: 'No assertions', componentResults: [] },
    };
  }

  async function references(evalId: string) {
    return (await getDb())
      .select()
      .from(blobReferencesTable)
      .where(eq(blobReferencesTable.evalId, evalId));
  }

  async function exportedAssets(evalId: string) {
    const evaluation = await Eval.findById(evalId);
    expect(evaluation).toBeDefined();
    return (await createOutputData(evaluation!, null, { includeMedia: true })).blobAssets ?? [];
  }

  async function importMedia(trace: boolean) {
    const id = randomUUID();
    const data = Buffer.from(`portable media ${id}`);
    const hash = sha256(data);
    const uri = `promptfoo://blob/${hash}`;
    const file = path.join(directory, 'import.json');
    writeFileSync(
      file,
      JSON.stringify({
        evalId: id,
        config: { prompts: ['blob'], providers: ['echo'] },
        results: {
          version: 3,
          timestamp: new Date().toISOString(),
          prompts: [{ raw: 'blob', label: 'blob', provider: 'echo' }],
          results: [result(0, { output: uri }), result(1, { output: trace ? 'control' : uri })],
        },
        blobAssets: [
          { hash, mimeType: 'audio/wav', sizeBytes: data.length, data: data.toString('base64') },
        ],
        ...(trace && {
          traces: [
            { traceId: randomUUID(), testCaseId: 'retained-trace', metadata: { uri }, spans: [] },
          ],
        }),
      }),
    );
    const program = new Command();
    importCommand(program);
    await program.parseAsync(['node', 'promptfoo', 'import', file]);
    const evaluation = await Eval.findById(id);
    expect(evaluation).toBeDefined();
    evaluations.push(evaluation!);
    return { id, hash, uri, data, rows: await EvalResult.findManyByEvalId(id) };
  }

  it('keeps imported URI-only media after deleting its original cell', async () => {
    const { id, hash, data, rows } = await importMedia(false);
    expect(await references(id)).toEqual([
      expect.objectContaining({ testIdx: 0, promptIdx: 0, kind: null, location: 'import' }),
    ]);
    await deleteEvalResult(id, rows.find((row) => row.testIdx === 0)!.id);
    expect((await getShareAuthorizedBlob(hash, id))?.data).toEqual(data);
    expect(await exportedAssets(id)).toEqual([expect.objectContaining({ hash })]);
    await deleteEvalResult(id, rows.find((row) => row.testIdx === 1)!.id);
    expect(await getShareAuthorizedBlob(hash, id)).toBeNull();
  });

  it('preserves imported provenance when only a retained trace uses the media', async () => {
    const { id, hash, data, rows } = await importMedia(true);
    await deleteEvalResult(id, rows.find((row) => row.testIdx === 0)!.id);
    expect(await references(id)).toEqual([
      expect.objectContaining({ testIdx: null, promptIdx: null, kind: null, location: 'import' }),
    ]);
    expect((await getShareAuthorizedBlob(hash, id))?.data).toEqual(data);
    expect(await exportedAssets(id)).toEqual([expect.objectContaining({ hash })]);
  });

  it('does not transfer classified media provenance to copied trace attributes', async () => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    evaluations.push(evaluation);
    const data = Buffer.from(`traced audio ${evaluation.id}`.repeat(40));
    await evaluation.addResult(
      result(0, { audio: { data: data.toString('base64'), format: 'wav' } }),
    );
    await evaluation.addResult(result(1, { output: 'ordinary surviving result' }));
    const traceStore = new TraceStore();
    const traceId = randomUUID();
    await traceStore.createTrace({ traceId, evaluationId: evaluation.id, testCaseId: 'survivor' });
    await traceStore.addSpans(traceId, [
      {
        spanId: randomUUID(),
        name: 'External provider telemetry',
        startTime: 1,
        attributes: { copiedBlobUri: `promptfoo://blob/${sha256(data)}` },
      },
    ]);
    const rows = await EvalResult.findManyByEvalId(evaluation.id);
    await deleteEvalResult(evaluation.id, rows.find((row) => row.testIdx === 0)!.id);
    expect(await traceStore.getTrace(traceId)).toBeDefined();
    expect(await getShareAuthorizedBlob(sha256(data), evaluation.id)).toBeNull();
    expect(await exportedAssets(evaluation.id)).toEqual([]);
  });

  it.each([
    { sameCell: false, cached: false },
    { sameCell: true, cached: false },
    { sameCell: false, cached: true },
  ])(
    'keeps independently extracted media (sameCell=$sameCell, cached=$cached)',
    async ({ sameCell, cached }) => {
      const evaluation = await EvalFactory.create({ numResults: 0 });
      evaluations.push(evaluation);
      const data = Buffer.from(`shared audio ${evaluation.id}`.repeat(40));
      const response = { cached, audio: { data: data.toString('base64'), format: 'wav' } };
      await evaluation.addResult(result(0, response));
      await evaluation.addResult(result(sameCell ? 0 : 1, response));
      const rows = await EvalResult.findManyByEvalId(evaluation.id);
      expect(await references(evaluation.id)).toHaveLength(2);
      await deleteEvalResult(evaluation.id, rows[0].id);
      expect((await getShareAuthorizedBlob(sha256(data), evaluation.id))?.data).toEqual(data);
      expect(await exportedAssets(evaluation.id)).toEqual([
        expect.objectContaining({ hash: sha256(data) }),
      ]);
      await deleteEvalResult(evaluation.id, rows[1].id);
      expect(await getShareAuthorizedBlob(sha256(data), evaluation.id)).toBeNull();
    },
  );

  it.each(['output', 'audio', 'metadata', 'testCase'] as const)(
    'does not transfer a classified reference to a copied envelope in %s',
    async (location) => {
      const evaluation = await EvalFactory.create({ numResults: 0 });
      evaluations.push(evaluation);
      const data = Buffer.from(`classified audio ${evaluation.id}`.repeat(40));
      await evaluation.addResult(
        result(0, { audio: { data: data.toString('base64'), format: 'wav' } }),
      );
      const [target] = await EvalResult.findManyByEvalId(evaluation.id);
      const blobRef = target.response!.audio!.blobRef!;
      const survivor = result(1, { output: 'copied envelope' });
      if (location === 'output') {
        survivor.response!.output = { ...blobRef };
      } else if (location === 'audio') {
        survivor.response!.audio = { blobRef: { ...blobRef } };
      } else if (location === 'metadata') {
        survivor.metadata = { copied: { ...blobRef } };
      } else {
        survivor.testCase.vars = { copied: { ...blobRef } };
      }
      await evaluation.addResult(survivor);
      expect(await references(evaluation.id)).toHaveLength(1);
      await deleteEvalResult(evaluation.id, target.id);
      expect(await getShareAuthorizedBlob(blobRef.hash, evaluation.id)).toBeNull();
      expect(await exportedAssets(evaluation.id)).toEqual([]);
    },
  );
});
