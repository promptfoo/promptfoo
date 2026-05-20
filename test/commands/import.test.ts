import fs from 'fs';
import path from 'path';

import { Command } from 'commander';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlobByHash, resetBlobStorageProvider, setBlobStorageProvider } from '../../src/blobs';
import * as blobRefs from '../../src/blobs/blobRefs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import { importCommand } from '../../src/commands/import';
import { getDb } from '../../src/database/index';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { TraceStore } from '../../src/tracing/store';
import { sha256 } from '../../src/util/createHash';
import { createTempDir, mockProcessEnv, removeTempDir } from '../util/utils';

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

describe('importCommand', () => {
  let program: Command;
  let tempFilePath: string;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    program = new Command();
    process.exitCode = undefined;

    // Clear all tables before each test
    const db = getDb();
    // Delete related tables first
    db.run('DELETE FROM blob_references');
    db.run('DELETE FROM blob_assets');
    db.run('DELETE FROM spans');
    db.run('DELETE FROM traces');
    db.run('DELETE FROM eval_results');
    db.run('DELETE FROM evals_to_datasets');
    db.run('DELETE FROM evals_to_prompts');
    db.run('DELETE FROM evals_to_tags');
    // Then delete from main table
    db.run('DELETE FROM evals');
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    // Clean up temp file if it exists
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  });

  describe('command registration', () => {
    it('should register the import command', () => {
      importCommand(program);

      const importCmd = program.commands.find((cmd) => cmd.name() === 'import');
      expect(importCmd).toBeDefined();
      expect(importCmd!.description()).toBe('Import an eval record from a JSON file');
    });
  });

  describe('error handling', () => {
    it('should handle file read errors', async () => {
      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', 'non-existent-file.json']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to import eval.*ENOENT/),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should handle invalid JSON', async () => {
      const filePath = path.join(__dirname, `temp-invalid-${Date.now()}.json`);
      fs.writeFileSync(filePath, 'invalid json');
      tempFilePath = filePath;

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', filePath]);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to import eval.*SyntaxError/),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should reject result payloads that are neither current nor legacy exports', async () => {
      const filePath = path.join(__dirname, `temp-unsupported-results-${Date.now()}.json`);
      const evalId = 'eval-unsupported-results';
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          id: evalId,
          config: { description: 'unsupported results shape' },
          results: {
            results: [{ success: true, response: { output: 'not enough legacy shape' } }],
          },
        }),
      );
      tempFilePath = filePath;

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', filePath]);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported eval export results format'),
      );
      expect(await Eval.findById(evalId)).toBeUndefined();
      expect(process.exitCode).toBe(1);
    });
  });

  describe('with real sample file', () => {
    it('should successfully import the sample export file preserving evalId', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');

      // Get the sample data to verify import details
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);

      // Check if the import process exited with an error
      expect(process.exitCode).toBeUndefined();

      // The evalId should now be preserved from the export file
      const importedEval = await Eval.findById(sampleData.evalId);

      expect(importedEval).toBeDefined();
      expect(importedEval!.id).toBe(sampleData.evalId);
      expect(importedEval!.config).toBeDefined();
      expect(importedEval!.prompts).toBeDefined();
      expect(importedEval!.prompts.length).toBe(2); // Based on sample file having 2 prompts

      // Verify that the config matches what we expect from the sample file
      expect(importedEval!.config.description).toBe(sampleData.config.description);
      expect(importedEval!.config.providers).toEqual(sampleData.config.providers);

      // Also verify that eval results were imported
      const results = await EvalResult.findManyByEvalId(importedEval!.id);
      expect(results.length).toBe(4); // Based on sample file having 4 results
    });

    it('should preserve createdAt timestamp from metadata', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);

      const importedEval = await Eval.findById(sampleData.evalId);
      expect(importedEval).toBeDefined();

      // Verify createdAt matches the metadata.evaluationCreatedAt from export
      const expectedCreatedAt = new Date(sampleData.metadata.evaluationCreatedAt).getTime();
      expect(importedEval!.createdAt).toBe(expectedCreatedAt);
    });

    it('should derive vars from results', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);

      const importedEval = await Eval.findById(sampleData.evalId);
      expect(importedEval).toBeDefined();

      // Verify vars were derived from results
      expect(importedEval!.vars).toBeDefined();
      expect(importedEval!.vars.length).toBeGreaterThan(0);
      // The sample has a 'riddle' variable
      expect(importedEval!.vars).toContain('riddle');
    });

    it('should preserve exported vars, runtime options, and durations', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
      sampleData.vars = ['riddle', 'unused_export_var'];
      sampleData.runtimeOptions = { cache: false, maxConcurrency: 2, repeat: 3 };
      sampleData.results.stats.durationMs = 4321;
      sampleData.results.stats.generationDurationMs = 123;
      sampleData.results.stats.evaluationDurationMs = 4198;

      const filePath = path.join(__dirname, `temp-parity-${Date.now()}.json`);
      fs.writeFileSync(filePath, JSON.stringify(sampleData));
      tempFilePath = filePath;

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', filePath]);

      const importedEval = await Eval.findById(sampleData.evalId);
      expect(importedEval).toBeDefined();
      expect(importedEval!.vars).toEqual(sampleData.vars);
      expect(importedEval!.runtimeOptions).toEqual(sampleData.runtimeOptions);
      expect(importedEval!.durationMs).toBe(4321);
      expect(importedEval!.generationDurationMs).toBe(123);
      expect(importedEval!.evaluationDurationMs).toBe(4198);
    });

    it('should import traces and attach them to the imported eval', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
      sampleData.traces = [
        {
          traceId: 'trace-imported',
          evaluationId: 'eval-from-another-machine',
          testCaseId: 'trace-case',
          metadata: { source: 'portable-export' },
          spans: [
            {
              spanId: 'span-imported',
              name: 'portable span',
              startTime: 10,
              endTime: 20,
              attributes: { operation: 'search' },
              statusCode: 1,
            },
            {
              spanId: 'span-malformed',
            },
          ],
        },
      ];

      const filePath = path.join(__dirname, `temp-trace-${Date.now()}.json`);
      fs.writeFileSync(filePath, JSON.stringify(sampleData));
      tempFilePath = filePath;

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', filePath]);

      const traces = await new TraceStore().getTracesByEvaluation(sampleData.evalId);
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        traceId: 'trace-imported',
        evaluationId: sampleData.evalId,
        testCaseId: 'trace-case',
        metadata: { source: 'portable-export' },
      });
      expect(traces[0].spans).toEqual([
        expect.objectContaining({
          spanId: 'span-imported',
          name: 'portable span',
          attributes: { operation: 'search' },
          statusCode: 1,
        }),
      ]);
    });

    it('should import embedded blob assets before recording result references', async () => {
      const blobDir = createTempDir('promptfoo-import-blobs-');
      setBlobStorageProvider(new FilesystemBlobStorageProvider({ basePath: blobDir }));

      try {
        const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
        const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
        const data = Buffer.from('portable image from eval export');
        const hash = sha256(data);
        sampleData.results.results[0].response = { output: `promptfoo://blob/${hash}` };
        sampleData.blobAssets = [
          {
            hash,
            mimeType: 'image/png',
            sizeBytes: data.length,
            data: data.toString('base64'),
          },
        ];

        const filePath = path.join(__dirname, `temp-blob-${Date.now()}.json`);
        fs.writeFileSync(filePath, JSON.stringify(sampleData));
        tempFilePath = filePath;

        importCommand(program);
        await program.parseAsync(['node', 'test', 'import', filePath]);

        const imported = await getBlobByHash(hash);
        expect(imported.data).toEqual(data);

        const references = (await getDb().all(
          `SELECT blob_hash, eval_id FROM blob_references WHERE blob_hash = '${hash}'`,
        )) as Array<{ blob_hash: string; eval_id: string }>;
        expect(references).toContainEqual({ blob_hash: hash, eval_id: sampleData.evalId });
      } finally {
        resetBlobStorageProvider();
        removeTempDir(blobDir);
      }
    });

    it('should import embedded blob assets referenced only by traces', async () => {
      const blobDir = createTempDir('promptfoo-import-trace-blobs-');
      setBlobStorageProvider(new FilesystemBlobStorageProvider({ basePath: blobDir }));

      try {
        const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
        const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
        const data = Buffer.from('portable trace image from eval export');
        const hash = sha256(data);
        sampleData.traces = [
          {
            traceId: 'trace-media-import',
            evaluationId: sampleData.evalId,
            testCaseId: 'trace-media-case',
            metadata: { attachment: `promptfoo://blob/${hash}` },
            spans: [],
          },
        ];
        sampleData.blobAssets = [
          {
            hash,
            mimeType: 'image/png',
            sizeBytes: data.length,
            data: data.toString('base64'),
          },
        ];

        const filePath = path.join(__dirname, `temp-trace-blob-${Date.now()}.json`);
        fs.writeFileSync(filePath, JSON.stringify(sampleData));
        tempFilePath = filePath;

        importCommand(program);
        await program.parseAsync(['node', 'test', 'import', filePath]);

        const imported = await getBlobByHash(hash);
        expect(imported.data).toEqual(data);

        const references = (await getDb().all(
          `SELECT blob_hash, eval_id, location FROM blob_references WHERE blob_hash = '${hash}'`,
        )) as Array<{ blob_hash: string; eval_id: string; location: string }>;
        expect(references).toContainEqual({
          blob_hash: hash,
          eval_id: sampleData.evalId,
          location: 'import',
        });
      } finally {
        resetBlobStorageProvider();
        removeTempDir(blobDir);
      }
    });

    it('should skip blob reference scans for imports without embedded assets', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const collectBlobHashesSpy = vi.spyOn(blobRefs, 'collectBlobHashes');

      try {
        importCommand(program);
        await program.parseAsync(['node', 'test', 'import', sampleFilePath]);

        expect(process.exitCode).toBeUndefined();
        expect(collectBlobHashesSpy).not.toHaveBeenCalled();
      } finally {
        collectBlobHashesSpy.mockRestore();
      }
    });

    it('should ignore unreferenced embedded blob assets before validation and storage', async () => {
      const blobDir = createTempDir('promptfoo-import-filtered-blobs-');
      const provider = new FilesystemBlobStorageProvider({ basePath: blobDir });
      const storeSpy = vi.spyOn(provider, 'store');
      setBlobStorageProvider(provider);

      try {
        const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
        const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
        const referencedData = Buffer.from('referenced portable image');
        const referencedHash = sha256(referencedData);
        const unreferencedHash = sha256(Buffer.from('expected orphan bytes'));
        const tamperedOrphanData = Buffer.from('tampered orphan bytes');
        sampleData.results.results[0].response = {
          output: `promptfoo://blob/${referencedHash}`,
        };
        sampleData.blobAssets = [
          {
            hash: referencedHash,
            mimeType: 'image/png',
            sizeBytes: referencedData.length,
            data: referencedData.toString('base64'),
          },
          {
            hash: unreferencedHash,
            mimeType: 'image/png',
            sizeBytes: tamperedOrphanData.length,
            data: tamperedOrphanData.toString('base64'),
          },
        ];

        const filePath = path.join(__dirname, `temp-filtered-blob-${Date.now()}.json`);
        fs.writeFileSync(filePath, JSON.stringify(sampleData));
        tempFilePath = filePath;

        importCommand(program);
        await program.parseAsync(['node', 'test', 'import', filePath]);

        expect(process.exitCode).toBeUndefined();
        expect(storeSpy).toHaveBeenCalledTimes(1);
        expect((await getBlobByHash(referencedHash)).data).toEqual(referencedData);
        await expect(getBlobByHash(unreferencedHash)).rejects.toThrow();
      } finally {
        storeSpy.mockRestore();
        resetBlobStorageProvider();
        removeTempDir(blobDir);
      }
    });

    it('should reject embedded blob assets whose bytes do not match the exported hash', async () => {
      const blobDir = createTempDir('promptfoo-import-corrupt-blobs-');
      setBlobStorageProvider(new FilesystemBlobStorageProvider({ basePath: blobDir }));

      try {
        const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
        const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
        const data = Buffer.from('wrong bytes');
        const hash = 'f'.repeat(64);
        sampleData.results.results[0].response = { output: `promptfoo://blob/${hash}` };
        sampleData.blobAssets = [
          {
            hash,
            mimeType: 'image/png',
            sizeBytes: data.length,
            data: data.toString('base64'),
          },
        ];

        const filePath = path.join(__dirname, `temp-corrupt-blob-${Date.now()}.json`);
        fs.writeFileSync(filePath, JSON.stringify(sampleData));
        tempFilePath = filePath;

        importCommand(program);
        await program.parseAsync(['node', 'test', 'import', filePath]);

        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Embedded blob hash mismatch'),
        );
        expect(process.exitCode).toBe(1);
      } finally {
        resetBlobStorageProvider();
        removeTempDir(blobDir);
      }
    });

    it('should preserve author from metadata', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);

      const importedEval = await Eval.findById(sampleData.evalId);
      expect(importedEval).toBeDefined();

      // Verify author is preserved from metadata
      expect(importedEval!.author).toBe(sampleData.metadata.author);
    });

    it('should preserve imported author even when the local user is cloud-authed as someone else', async () => {
      // Simulate a cloud-authed importer with a different local identity. The
      // imported eval's historical author must still win — this is a
      // regression test for PR #7760.
      const restoreEnv = mockProcessEnv({ PROMPTFOO_API_KEY: 'fake-test-api-key' });
      try {
        const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
        const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));

        importCommand(program);
        await program.parseAsync(['node', 'test', 'import', sampleFilePath]);

        const importedEval = await Eval.findById(sampleData.evalId);
        expect(importedEval).toBeDefined();
        expect(importedEval!.author).toBe(sampleData.metadata.author);
      } finally {
        restoreEnv();
      }
    });

    it('should import legacy table-backed eval exports', async () => {
      const evalId = 'eval-legacy-table-backed';
      const filePath = path.join(__dirname, `temp-legacy-v2-${Date.now()}.json`);
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          id: evalId,
          createdAt: '2024-01-02T03:04:05.000Z',
          author: 'legacy-author',
          config: { description: 'legacy import' },
          results: {
            version: 2,
            timestamp: '2024-01-02T03:04:05.000Z',
            results: [{ success: true, vars: { topic: 'legacy' } }],
            table: { head: { prompts: [], vars: ['topic'] }, body: [] },
            stats: { successes: 1, failures: 0 },
          },
        }),
      );
      tempFilePath = filePath;

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', filePath]);

      const importedEval = await Eval.findById(evalId);
      expect(importedEval).toBeDefined();
      expect(importedEval!.author).toBe('legacy-author');
      expect(await importedEval!.toEvaluateSummary()).toMatchObject({
        version: 2,
        results: [{ success: true, vars: { topic: 'legacy' } }],
        table: { head: { vars: ['topic'] } },
      });
    });
  });

  describe('collision handling', () => {
    it('should reject import when eval already exists', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));

      importCommand(program);

      // First import should succeed
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);
      expect(process.exitCode).toBeUndefined();

      // Reset mocks and exitCode for second import
      vi.clearAllMocks();
      process.exitCode = undefined;

      // Second import should fail with collision error
      const program2 = new Command();
      importCommand(program2);
      await program2.parseAsync(['node', 'test', 'import', sampleFilePath]);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(`Eval ${sampleData.evalId} already exists`),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should allow import with --new-id flag when eval already exists', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));

      importCommand(program);

      // First import should succeed
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);
      expect(process.exitCode).toBeUndefined();

      // Reset mocks and exitCode for second import
      vi.clearAllMocks();
      process.exitCode = undefined;

      // Second import with --new-id should succeed
      const program2 = new Command();
      importCommand(program2);
      await program2.parseAsync(['node', 'test', 'import', '--new-id', sampleFilePath]);

      expect(process.exitCode).toBeUndefined();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/has been successfully imported/),
      );

      // Should now have 2 evals in database
      const allEvals = await Eval.getMany(10);
      expect(allEvals.length).toBe(2);

      // One should have the original ID, one should have a new ID
      const originalEval = allEvals.find((e) => e.id === sampleData.evalId);
      const newEval = allEvals.find((e) => e.id !== sampleData.evalId);
      expect(originalEval).toBeDefined();
      expect(newEval).toBeDefined();
    });

    it('should remap trace IDs for duplicate imports with --new-id', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
      sampleData.traces = [
        {
          traceId: 'trace-duplicate-import',
          evaluationId: sampleData.evalId,
          testCaseId: 'trace-case',
          spans: [{ spanId: 'span-duplicate-import', name: 'span', startTime: 10 }],
        },
      ];

      const filePath = path.join(__dirname, `temp-trace-new-id-${Date.now()}.json`);
      fs.writeFileSync(filePath, JSON.stringify(sampleData));
      tempFilePath = filePath;

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', filePath]);

      const program2 = new Command();
      importCommand(program2);
      await program2.parseAsync(['node', 'test', 'import', '--new-id', filePath]);

      const allEvals = await Eval.getMany(10);
      const duplicateEval = allEvals.find((eval_) => eval_.id !== sampleData.evalId);
      expect(duplicateEval).toBeDefined();

      const traceStore = new TraceStore();
      const originalTraces = await traceStore.getTracesByEvaluation(sampleData.evalId);
      const duplicateTraces = await traceStore.getTracesByEvaluation(duplicateEval!.id);
      expect(originalTraces).toHaveLength(1);
      expect(duplicateTraces).toHaveLength(1);
      expect(duplicateTraces[0].traceId).not.toBe(originalTraces[0].traceId);
      expect(duplicateTraces[0].spans).toEqual([
        expect.objectContaining({ spanId: 'span-duplicate-import' }),
      ]);
    });

    it('should remap imported trace IDs that already belong to another eval', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
      sampleData.traces = [
        {
          traceId: 'trace-cross-eval-collision',
          evaluationId: sampleData.evalId,
          testCaseId: 'trace-case',
          spans: [{ spanId: 'span-original', name: 'original span', startTime: 10 }],
        },
      ];

      const filePath = path.join(__dirname, `temp-trace-collision-${Date.now()}.json`);
      fs.writeFileSync(filePath, JSON.stringify(sampleData));
      tempFilePath = filePath;

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', filePath]);

      const collidingData = structuredClone(sampleData);
      collidingData.evalId = 'eval-trace-collision-import';
      collidingData.traces[0].evaluationId = collidingData.evalId;
      collidingData.traces[0].spans = [
        { spanId: 'span-imported', name: 'imported span', startTime: 20 },
      ];
      fs.writeFileSync(filePath, JSON.stringify(collidingData));

      const program2 = new Command();
      importCommand(program2);
      await program2.parseAsync(['node', 'test', 'import', filePath]);

      const traceStore = new TraceStore();
      const originalTraces = await traceStore.getTracesByEvaluation(sampleData.evalId);
      const importedTraces = await traceStore.getTracesByEvaluation(collidingData.evalId);

      expect(originalTraces).toHaveLength(1);
      expect(originalTraces[0].spans).toEqual([
        expect.objectContaining({ spanId: 'span-original' }),
      ]);
      expect(importedTraces).toHaveLength(1);
      expect(importedTraces[0].traceId).not.toBe(originalTraces[0].traceId);
      expect(importedTraces[0].spans).toEqual([
        expect.objectContaining({ spanId: 'span-imported' }),
      ]);
    });

    it('should replace existing eval with --force flag', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));

      importCommand(program);

      // First import should succeed
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);
      expect(process.exitCode).toBeUndefined();

      // Verify the eval exists
      const firstImport = await Eval.findById(sampleData.evalId);
      expect(firstImport).toBeDefined();

      // Reset mocks and exitCode for second import
      vi.clearAllMocks();
      process.exitCode = undefined;

      // Second import with --force should succeed and replace existing
      const program2 = new Command();
      importCommand(program2);
      await program2.parseAsync(['node', 'test', 'import', '--force', sampleFilePath]);

      expect(process.exitCode).toBeUndefined();
      expect(logger.info).toHaveBeenCalledWith(`Replacing existing eval ${sampleData.evalId}`);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/has been successfully imported/),
      );

      // Should still have only 1 eval in database (replaced, not duplicated)
      const allEvals = await Eval.getMany(10);
      expect(allEvals.length).toBe(1);
      expect(allEvals[0].id).toBe(sampleData.evalId);

      // Verify the eval data is correct
      const replacedEval = await Eval.findById(sampleData.evalId);
      expect(replacedEval).toBeDefined();
      expect(replacedEval!.config.description).toBe(sampleData.config.description);
    });

    it('should keep the existing eval when a --force replacement fails preflight', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
      const replacementData = structuredClone(sampleData);
      const badData = Buffer.from('wrong replacement bytes');
      const hash = 'f'.repeat(64);
      replacementData.results.results[0].response = { output: `promptfoo://blob/${hash}` };
      replacementData.blobAssets = [
        {
          hash,
          mimeType: 'image/png',
          sizeBytes: badData.length,
          data: badData.toString('base64'),
        },
      ];

      const filePath = path.join(__dirname, `temp-force-corrupt-blob-${Date.now()}.json`);
      fs.writeFileSync(filePath, JSON.stringify(replacementData));
      tempFilePath = filePath;

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);
      expect(process.exitCode).toBeUndefined();

      vi.clearAllMocks();
      process.exitCode = undefined;

      const program2 = new Command();
      importCommand(program2);
      await program2.parseAsync(['node', 'test', 'import', '--force', filePath]);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Embedded blob hash mismatch'),
      );
      expect(process.exitCode).toBe(1);

      const preservedEval = await Eval.findById(sampleData.evalId);
      expect(preservedEval).toBeDefined();
      expect(await EvalResult.findManyByEvalId(sampleData.evalId)).toHaveLength(4);
    });

    it('should keep the existing eval when a --force replacement cannot store embedded media', async () => {
      const blobDir = createTempDir('promptfoo-import-force-store-failure-');
      const provider = new FilesystemBlobStorageProvider({ basePath: blobDir });
      setBlobStorageProvider(provider);

      try {
        const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
        const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
        const replacementData = structuredClone(sampleData);
        const replacementBlob = Buffer.from('valid replacement bytes');
        const replacementHash = sha256(replacementBlob);
        replacementData.results.results[0].response = {
          output: `promptfoo://blob/${replacementHash}`,
        };
        replacementData.blobAssets = [
          {
            hash: replacementHash,
            mimeType: 'image/png',
            sizeBytes: replacementBlob.length,
            data: replacementBlob.toString('base64'),
          },
        ];

        const filePath = path.join(__dirname, `temp-force-store-failure-${Date.now()}.json`);
        fs.writeFileSync(filePath, JSON.stringify(replacementData));
        tempFilePath = filePath;

        importCommand(program);
        await program.parseAsync(['node', 'test', 'import', sampleFilePath]);
        expect(process.exitCode).toBeUndefined();

        vi.clearAllMocks();
        process.exitCode = undefined;
        const storeSpy = vi
          .spyOn(provider, 'store')
          .mockRejectedValueOnce(new Error('embedded media storage failed'));

        const program2 = new Command();
        importCommand(program2);
        await program2.parseAsync(['node', 'test', 'import', '--force', filePath]);

        expect(storeSpy).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('embedded media storage failed'),
        );
        expect(process.exitCode).toBe(1);
        expect(await Eval.findById(sampleData.evalId)).toBeDefined();
        expect(await EvalResult.findManyByEvalId(sampleData.evalId)).toHaveLength(4);
      } finally {
        resetBlobStorageProvider();
        removeTempDir(blobDir);
      }
    });

    it('should import normally with --force flag when eval does not exist', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));

      importCommand(program);

      // Import with --force when no eval exists should succeed normally
      await program.parseAsync(['node', 'test', 'import', '--force', sampleFilePath]);

      expect(process.exitCode).toBeUndefined();
      // Should NOT log "Replacing existing eval" since there was nothing to replace
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Replacing existing eval'),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/has been successfully imported/),
      );

      // Verify the eval was imported with original ID
      const importedEval = await Eval.findById(sampleData.evalId);
      expect(importedEval).toBeDefined();
      expect(importedEval!.id).toBe(sampleData.evalId);
    });

    it('should show updated error message mentioning --force option', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');

      importCommand(program);

      // First import should succeed
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);
      expect(process.exitCode).toBeUndefined();

      // Reset mocks and exitCode for second import
      vi.clearAllMocks();
      process.exitCode = undefined;

      // Second import without flags should fail with error mentioning both options
      const program2 = new Command();
      importCommand(program2);
      await program2.parseAsync(['node', 'test', 'import', sampleFilePath]);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('--new-id'));
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('--force'));
      expect(process.exitCode).toBe(1);
    });
  });
});
