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
  default: ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('../../src/telemetry', () => ({
  default: ({
    record: vi.fn()
  })
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
    mockExit = vi.spyOn(process, 'exit').mockImplementation(function() {
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
    it('should successfully import the sample export file into the database', async () => {
      const sampleFilePath = path.join(__dirname, '../__fixtures__/sample-export.json');

      // Get the sample data to verify import details
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', sampleFilePath]);

      // Check if the import process exited with an error
      expect(mockExit).not.toHaveBeenCalledWith(1);

      // Since the sample file doesn't have an 'id' field (only 'evalId'),
      // the import will generate a new ID. Let's find the imported eval by looking at all evals.
      const allEvals = await Eval.getMany(1); // Get first eval

      expect(allEvals.length).toBe(1);
      const importedEval = allEvals[0];

      expect(importedEval).toBeDefined();
      expect(importedEval.id).toBeDefined();
      expect(importedEval.config).toBeDefined();
      expect(importedEval.prompts).toBeDefined();
      expect(importedEval.prompts.length).toBe(2); // Based on sample file having 2 prompts

      // Verify that the config matches what we expect from the sample file
      expect(importedEval.config.description).toBe(sampleData.config.description);
      expect(importedEval.config.providers).toEqual(sampleData.config.providers);

      // Also verify that eval results were imported
      const results = await EvalResult.findManyByEvalId(importedEval.id);
      expect(results.length).toBe(4); // Based on sample file having 4 results
    });
  });
});
