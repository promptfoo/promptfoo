import { MockInstance, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

import { Command } from 'commander';
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
  let mockExit: MockInstance;
  let tempFilePath: string;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    program = new Command();
    mockExit = vi.spyOn(process, 'exit').mockImplementation(function () {
      return undefined as never;
    });

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
      expect(mockExit).toHaveBeenCalledWith(1);
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
      expect(mockExit).toHaveBeenCalledWith(1);
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
      expect(mockExit).not.toHaveBeenCalledWith(1);

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
      expect(mockExit).not.toHaveBeenCalledWith(1);

      // Reset mocks for second import
      vi.clearAllMocks();

      // Second import should fail with collision error
      const program2 = new Command();
      importCommand(program2);
      await program2.parseAsync(['node', 'test', 'import', sampleFilePath]);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(`Eval ${sampleData.evalId} already exists`),
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should allow import with --new-id flag when eval already exists', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));

      importCommand(program);

      // First import should succeed
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);
      expect(mockExit).not.toHaveBeenCalledWith(1);

      // Reset mocks for second import
      vi.clearAllMocks();

      // Second import with --new-id should succeed
      const program2 = new Command();
      importCommand(program2);
      await program2.parseAsync(['node', 'test', 'import', '--new-id', sampleFilePath]);

      expect(mockExit).not.toHaveBeenCalledWith(1);
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
  });
});
