import * as fs from 'fs';
import { Command } from 'commander';
import { importCommand } from '../../src/commands/import';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';

jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn().mockReturnValue('test@example.com'),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  statSync: jest.fn().mockReturnValue({ size: 1024 * 1024 }), // 1MB
}));

// Mock database to avoid better-sqlite3 binding issues
jest.mock('../../src/database', () => ({
  getDb: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnValue([]),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    run: jest.fn(),
    delete: jest.fn().mockReturnThis(),
    transaction: jest.fn((cb) =>
      cb({
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        run: jest.fn(),
        delete: jest.fn().mockReturnThis(),
      }),
    ),
  })),
}));

jest.mock('../../src/models/eval', () => {
  const mockEval = {
    create: jest.fn(),
    findById: jest.fn(),
    latest: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockEval,
    ...mockEval,
    createEvalId: jest.fn((date) => `eval-test-${date?.toISOString()?.slice(0, 19) || 'new'}`),
  };
});

jest.mock('../../src/models/evalResult', () => {
  const mockEvalResult = {
    createManyFromEvaluateResult: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockEvalResult,
    ...mockEvalResult,
  };
});

describe('importCommand', () => {
  let program: Command;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    program = new Command();
    mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      if (code === 1) {
        throw new Error(`Process exited with code ${code}`);
      }
      return undefined as never;
    });

    jest.clearAllMocks();

    // Default mock for findById - return null by default
    jest.spyOn(Eval, 'findById').mockResolvedValue(null as any);

    // Reset fs mocks to default behavior
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockImplementation(() => '{}');

    // Reset database mock
    const { getDb } = require('../../src/database');
    getDb.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnValue([]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      run: jest.fn(),
      delete: jest.fn().mockReturnThis(),
      transaction: jest.fn((cb) =>
        cb({
          insert: jest.fn().mockReturnThis(),
          values: jest.fn().mockReturnThis(),
          run: jest.fn(),
          delete: jest.fn().mockReturnThis(),
        }),
      ),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('v2 import', () => {
    it('should import v2 eval successfully', async () => {
      const v2Data = {
        id: 'eval-v2-test',
        createdAt: '2024-01-01T00:00:00.000Z',
        author: 'test-author',
        description: 'Test v2 eval',
        results: {
          version: 2,
          timestamp: '2024-01-01T00:00:00.000Z',
          results: [
            {
              prompt: { raw: 'test prompt', label: 'test' },
              vars: { var1: 'value1' },
              response: { output: 'test output' },
              success: true,
              score: 1.0,
            },
          ],
          table: {
            head: { prompts: [{ raw: 'test', label: 'test' }], vars: ['var1'] },
            body: [
              {
                outputs: ['test output'],
                vars: ['value1'],
              },
            ],
          },
          stats: { successes: 1, failures: 0, errors: 0 },
        },
        config: { prompts: ['test.txt'] },
      };

      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(v2Data));

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', 'test-v2.json']);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-v2.json'),
        'utf-8',
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Eval with ID eval-v2-test has been successfully imported.',
      );
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('should generate ID if not provided in v2', async () => {
      const v2Data = {
        createdAt: '2024-01-01T00:00:00.000Z',
        results: {
          version: 2,
          timestamp: '2024-01-01T00:00:00.000Z',
          results: [],
          table: {
            head: { prompts: [], vars: [] },
            body: [],
          },
          stats: { successes: 0, failures: 0, errors: 0 },
        },
        config: {},
      };

      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(v2Data));

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', 'test-v2.json']);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(
          /^Eval with ID eval-\w+-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} has been successfully imported\.$/,
        ),
      );
    });
  });

  describe('v3 import', () => {
    it('should import v3 eval into v4 structure successfully', async () => {
      const v3Data = {
        id: 'eval-v3-test',
        createdAt: '2024-10-15T00:00:00.000Z',
        author: 'test-author',
        results: {
          version: 3,
          timestamp: '2024-10-15T00:00:00.000Z',
          prompts: [
            { raw: 'test prompt {{var1}}', label: 'test-prompt', provider: 'openai:gpt-3.5-turbo' },
          ],
          results: [
            {
              prompt: { raw: 'test prompt value1', label: 'test' },
              promptId: 'test-prompt-id',
              vars: { var1: 'value1' },
              response: { output: 'test output' },
              success: true,
              score: 1.0,
              testIdx: 0,
              promptIdx: 0,
              provider: { id: 'openai:gpt-3.5-turbo', label: 'OpenAI' },
              testCase: { vars: { var1: 'value1' } },
              namedScores: {},
              latencyMs: 100,
              cost: 0,
            },
          ],
          stats: { successes: 1, failures: 0, errors: 0 },
        },
        config: { prompts: ['test.txt'] },
      };

      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(v3Data));

      const mockEval = {
        id: 'eval-v3-test',
        createdAt: '2024-10-15T00:00:00.000Z',
        prompts: [],
        addPrompts: jest.fn().mockResolvedValue(undefined),
      };

      jest.spyOn(Eval, 'create').mockResolvedValue(mockEval as any);
      jest.spyOn(EvalResult, 'createManyFromEvaluateResult').mockResolvedValue([]);

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', 'test-v3.json']);

      expect(Eval.create).toHaveBeenCalledWith(v3Data.config, expect.any(Array), {
        id: 'eval-v3-test',
        createdAt: new Date('2024-10-15T00:00:00.000Z'),
        author: 'test-author',
      });

      expect(EvalResult.createManyFromEvaluateResult).toHaveBeenCalledWith(
        expect.any(Array),
        'eval-v3-test',
        { returnInstances: false },
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Eval with ID eval-v3-test has been successfully imported.',
      );
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('should handle v3 import with missing prompts', async () => {
      const v3Data = {
        results: {
          version: 3,
          timestamp: '2024-10-15T00:00:00.000Z',
          prompts: [], // Even if empty, prompts field is required
          results: [],
          stats: { successes: 0, failures: 0, errors: 0 },
        },
        config: {},
      };

      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(v3Data));
      const mockEval = {
        id: 'test-id',
        prompts: [],
        addPrompts: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(Eval, 'create').mockResolvedValue(mockEval as any);
      jest.spyOn(EvalResult, 'createManyFromEvaluateResult').mockResolvedValue([]);

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', 'test-v3.json']);

      expect(Eval.create).toHaveBeenCalledWith(
        {},
        [], // Empty prompts array
        expect.any(Object),
      );
    });
  });

  describe('error handling', () => {
    it('should handle file not found error', async () => {
      // Mock readFileSync to throw ENOENT error
      jest.mocked(fs.readFileSync).mockImplementation(() => {
        const error = new Error('ENOENT: no such file or directory');
        (error as any).code = 'ENOENT';
        throw error;
      });

      importCommand(program);

      try {
        await program.parseAsync(['node', 'test', 'import', 'nonexistent.json']);
      } catch (_error) {
        // Expected to throw because we mock process.exit to throw
      }

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to import eval: File not found: nonexistent.json',
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle invalid JSON', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue('invalid json {');

      importCommand(program);

      try {
        await program.parseAsync(['node', 'test', 'import', 'invalid.json']);
      } catch (_error) {
        // Expected to throw because we mock process.exit to throw
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON in file invalid.json:'),
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle missing version field', async () => {
      const invalidData = {
        results: {
          /* no version field */
        },
        config: {},
      };

      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidData));

      importCommand(program);

      try {
        await program.parseAsync(['node', 'test', 'import', 'no-version.json']);
      } catch (_error) {
        // Expected to throw because we mock process.exit to throw
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid eval format:'));
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle database insertion error', async () => {
      const v2Data = {
        results: {
          version: 2,
          timestamp: '2024-01-01T00:00:00.000Z',
          results: [],
          table: {
            head: { prompts: [], vars: [] },
            body: [],
          },
          stats: { successes: 0, failures: 0, errors: 0 },
        },
        config: {},
      };

      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(v2Data));

      const { getDb } = require('../../src/database');
      getDb.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue([]),
        transaction: jest.fn(() => {
          throw new Error('Database error');
        }),
      });

      importCommand(program);

      try {
        await program.parseAsync(['node', 'test', 'import', 'test.json']);
      } catch (_error) {
        // Expected to throw because we mock process.exit to throw
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Database error'));
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle v3 import creation error', async () => {
      const v3Data = {
        results: {
          version: 3,
          timestamp: '2024-10-15T00:00:00.000Z',
          prompts: [],
          results: [],
          stats: { successes: 0, failures: 0, errors: 0 },
        },
        config: {},
      };

      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(v3Data));
      jest.spyOn(Eval, 'create').mockRejectedValue(new Error('Creation failed'));

      importCommand(program);

      try {
        await program.parseAsync(['node', 'test', 'import', 'test-v3.json']);
      } catch (_error) {
        // Expected to throw because we mock process.exit to throw
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Creation failed'));
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty results array', async () => {
      const v3Data = {
        results: {
          version: 3,
          timestamp: '2024-10-15T00:00:00.000Z',
          prompts: [],
          results: [],
          stats: { successes: 0, failures: 0, errors: 0 },
        },
        config: {},
      };

      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(v3Data));
      const mockEval = {
        id: 'test-id',
        prompts: [],
        addPrompts: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(Eval, 'create').mockResolvedValue(mockEval as any);

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', 'empty.json']);

      expect(EvalResult.createManyFromEvaluateResult).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully imported'));
    });

    it('should handle very large result sets with batching', async () => {
      const largeResults = Array(5000)
        .fill(null)
        .map((_, i) => ({
          prompt: { raw: 'test', label: 'test' },
          promptId: 'test-prompt-id',
          vars: { idx: i },
          response: { output: `output ${i}` },
          success: true,
          score: 1.0,
          testIdx: i,
          promptIdx: 0,
          provider: { id: 'echo', label: 'Echo' },
          testCase: { vars: { idx: i } },
          namedScores: {},
          latencyMs: 1,
          cost: 0,
        }));

      const v3Data = {
        results: {
          version: 3,
          timestamp: '2024-10-15T00:00:00.000Z',
          prompts: [{ raw: 'test', label: 'test', provider: 'echo' }],
          results: largeResults,
          stats: { successes: 5000, failures: 0, errors: 0 },
        },
        config: {},
      };

      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(v3Data));
      const mockEval = {
        id: 'test-id',
        prompts: [],
        addPrompts: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(Eval, 'create').mockResolvedValue(mockEval as any);
      jest.spyOn(EvalResult, 'createManyFromEvaluateResult').mockResolvedValue([]);

      importCommand(program);
      await program.parseAsync(['node', 'test', 'import', 'large.json']);

      // Should be called in batches
      expect(EvalResult.createManyFromEvaluateResult).toHaveBeenCalledTimes(5);
      expect(EvalResult.createManyFromEvaluateResult).toHaveBeenCalledWith(
        expect.any(Array),
        'test-id',
        { returnInstances: false },
      );
    });
  });
});
