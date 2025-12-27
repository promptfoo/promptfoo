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
