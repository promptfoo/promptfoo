import fs from 'fs';
import path from 'path';

import { Command } from 'commander';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { importCommand } from '../../src/commands/import';
import { getDb } from '../../src/database/index';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { mockProcessEnv } from '../util/utils';

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
      expect(importCmd!.description()).toBe(
        'Import a Promptfoo eval JSON export or an OpenAI Evals JSONL export',
      );
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
  });

  describe('with OpenAI eval items JSONL export', () => {
    it('should import grader outcomes and preserve OpenAI metadata', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/openai-evals-items.jsonl');

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);

      expect(process.exitCode).toBeUndefined();

      const importedEval = await Eval.findById('openai-evals-evalrun_import_fixture');
      expect(importedEval).toBeDefined();
      expect(importedEval!.config.description).toBe(
        'Imported from OpenAI Evals run evalrun_import_fixture',
      );
      expect(importedEval!.config.metadata?.openaiEvalsImport).toEqual({
        format: 'dashboard-output-items-jsonl',
        rowCount: 2,
        runIds: ['evalrun_import_fixture'],
      });
      expect(importedEval!.prompts).toHaveLength(1);
      expect(importedEval!.prompts[0].metrics?.testPassCount).toBe(1);
      expect(importedEval!.prompts[0].metrics?.testFailCount).toBe(1);
      expect(importedEval!.prompts[0].metrics?.assertPassCount).toBe(5);
      expect(importedEval!.prompts[0].metrics?.assertFailCount).toBe(1);

      const results = (await EvalResult.findManyByEvalId(importedEval!.id)).sort(
        (a, b) => a.testIdx - b.testIdx,
      );
      expect(results).toHaveLength(2);
      expect(results[0].namedScores).toEqual({
        Relevance: 6,
        Directness: 3,
        'Tool called': 1,
      });
      expect(results[0].gradingResult?.pass).toBe(true);
      expect(results[0].gradingResult?.componentResults).toHaveLength(3);
      expect(results[0].metadata?.openai?.dataSourceIdx).toBe(10);
      expect(results[0].metadata?.openai?.graderSamples?.Relevance).toEqual({
        outputs: [{ role: 'assistant', content: '{"result":6}' }],
      });
      expect(results[0].metadata?.openai?.outputItem).toMatchObject({
        run_id: 'evalrun_import_fixture',
        data_source_idx: 10,
        item: {
          input: 'How do I unsubscribe from marketing emails?',
        },
      });

      expect(results[1].success).toBe(false);
      expect(results[1].failureReason).toBe(1);
      expect(results[1].gradingResult?.reason).toContain('Relevance');
      expect(results[1].testCase.vars?.item).toMatchObject({
        input: 'Can I use multiple promo codes?',
      });
    });

    it('should preserve run-based collision behavior for OpenAI JSONL imports', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/openai-evals-items.jsonl');

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);
      expect(process.exitCode).toBeUndefined();

      vi.clearAllMocks();
      process.exitCode = undefined;

      const program2 = new Command();
      importCommand(program2);
      await program2.parseAsync(['node', 'test', 'import', sampleFilePath]);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Eval openai-evals-evalrun_import_fixture already exists'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should import multi-run samples as comparable prompt columns', async () => {
      const sampleFilePath = path.join(
        __dirname,
        '../__fixtures__/openai-evals-multi-run-items.jsonl',
      );

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);

      expect(process.exitCode).toBeUndefined();

      const importedEvals = await Eval.getMany(10);
      expect(importedEvals).toHaveLength(1);
      expect(importedEvals[0].prompts).toHaveLength(2);
      expect(importedEvals[0].prompts.map((prompt) => prompt.provider)).toEqual([
        'openai-evals:evalrun_error_fixture',
        'openai-evals:evalrun_pass_fixture',
      ]);
      expect(importedEvals[0].prompts[0].metrics?.testErrorCount).toBe(1);
      expect(importedEvals[0].prompts[0].metrics?.testFailCount).toBe(0);
      expect(importedEvals[0].prompts[1].metrics?.testPassCount).toBe(1);
      expect(importedEvals[0].prompts[1].metrics?.tokenUsage).toMatchObject({
        total: 10,
        prompt: 8,
        completion: 2,
        cached: 1,
        numRequests: 1,
      });

      const results = await EvalResult.findManyByEvalId(importedEvals[0].id);
      expect(results).toHaveLength(2);
      expect(results.map((result) => result.testIdx)).toEqual([0, 0]);

      const errorResult = results.find(
        (result) => result.metadata?.openai?.runId === 'evalrun_error_fixture',
      );
      expect(errorResult?.failureReason).toBe(2);
      expect(errorResult?.error).toBe('Response input item missing role');
      expect(errorResult?.metadata?.openai?.sample?.error?.type).toBe('invalid_request_error');

      const passedResult = results.find(
        (result) => result.metadata?.openai?.runId === 'evalrun_pass_fixture',
      );
      expect(passedResult?.response?.output).toBe('Hardware');
      expect(passedResult?.response?.finishReason).toBe('stop');
      expect(passedResult?.response?.tokenUsage).toEqual({
        total: 10,
        prompt: 8,
        completion: 2,
        cached: 1,
        numRequests: 1,
      });
    });

    it('should keep non-equivalent multi-run items on separate test rows', async () => {
      const filePath = path.join(__dirname, `temp-openai-evals-${Date.now()}.jsonl`);
      fs.writeFileSync(
        filePath,
        [
          {
            run_id: 'evalrun_first_dataset',
            data_source_idx: 0,
            item: { input: 'First dataset item' },
            grades: { Match: 1 },
            passes: { Match: true },
          },
          {
            run_id: 'evalrun_second_dataset',
            data_source_idx: 0,
            item: { input: 'Different dataset item' },
            grades: { Match: 1 },
            passes: { Match: true },
          },
        ]
          .map((row) => JSON.stringify(row))
          .join('\n'),
      );
      tempFilePath = filePath;

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', filePath]);

      expect(process.exitCode).toBeUndefined();

      const importedEvals = await Eval.getMany(10);
      const results = await EvalResult.findManyByEvalId(importedEvals[0].id);

      expect(importedEvals[0].config.tests).toHaveLength(2);
      expect(results).toHaveLength(2);
      expect(results.map((result) => result.testIdx)).toEqual([0, 1]);
      expect(results.map((result) => result.testCase.vars?.item)).toEqual([
        { input: 'First dataset item' },
        { input: 'Different dataset item' },
      ]);
    });

    it('should import dashboard rows that omit optional pass results as score-only data', async () => {
      const filePath = path.join(__dirname, `temp-openai-evals-${Date.now()}.jsonl`);
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          run_id: 'evalrun_without_passes',
          data_source_idx: 0,
          item: { input: 'Grade this later' },
          grades: { Quality: 0.5 },
          eval_id: 'eval_future_shape',
        }),
      );
      tempFilePath = filePath;

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', filePath]);

      expect(process.exitCode).toBeUndefined();

      const importedEval = await Eval.findById('openai-evals-evalrun_without_passes');
      const results = await EvalResult.findManyByEvalId(importedEval!.id);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].gradingResult?.pass).toBe(true);
      expect(results[0].gradingResult?.componentResults).toEqual([]);
      expect(results[0].gradingResult?.reason).toContain('did not include grader pass results');
      expect(importedEval!.prompts[0].metrics).toMatchObject({
        testPassCount: 1,
        testFailCount: 0,
        assertPassCount: 0,
        assertFailCount: 0,
      });
      expect(results[0].metadata?.openai?.passes).toEqual({});
      expect(results[0].metadata?.openai?.outputItem?.eval_id).toBe('eval_future_shape');
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
