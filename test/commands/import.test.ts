import fs from 'fs';
import { Command } from 'commander';

import { importCommand } from '../../src/commands/import';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { getDb } from '../../src/database';

jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('../../src/models/eval');
jest.mock('../../src/models/evalResult');

describe('importCommand', () => {
  let program: Command;
  let mockExit: jest.SpyInstance;
  let mockFs: jest.Mocked<typeof fs>;
  let mockDb: any;
  let mockEval: jest.Mocked<typeof Eval>;
  let mockEvalResult: jest.Mocked<typeof EvalResult>;

  beforeEach(() => {
    program = new Command();
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockFs = fs as jest.Mocked<typeof fs>;
    mockDb = {
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          run: jest.fn(),
        }),
      }),
    };
    mockEval = Eval as jest.Mocked<typeof Eval>;
    mockEvalResult = EvalResult as jest.Mocked<typeof EvalResult>;

    (getDb as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('v3 format import', () => {
    it('should import v3 format with evalId and metadata', async () => {
      const v3Data = {
        evalId: 'test-eval-123',
        results: {
          version: 3,
          timestamp: '2024-01-01T12:00:00.000Z',
          prompts: [
            {
              raw: 'test prompt',
              label: 'test prompt',
              id: 'prompt-id',
              provider: '',
              metrics: {
                score: 0,
                testPassCount: 0,
                testFailCount: 0,
                testErrorCount: 0,
                assertPassCount: 0,
                assertFailCount: 0,
                totalLatencyMs: 0,
                tokenUsage: {
                  prompt: 0,
                  completion: 0,
                  cached: 0,
                  total: 0,
                  numRequests: 0,
                  completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
                  assertions: {
                    total: 0,
                    prompt: 0,
                    completion: 0,
                    cached: 0,
                    numRequests: 0,
                    completionDetails: {
                      reasoning: 0,
                      acceptedPrediction: 0,
                      rejectedPrediction: 0,
                    },
                  },
                },
                namedScores: {},
                namedScoresCount: {},
                cost: 0,
              },
            },
          ],
          results: [
            {
              promptIdx: 0,
              testIdx: 0,
              testCase: {},
              promptId: 'prompt-id',
              provider: { id: 'test', label: 'test' },
              prompt: { raw: 'test prompt' },
              vars: {},
              success: true,
              score: 1,
              latencyMs: 100,
              namedScores: {},
              failureReason: 0,
            },
          ],
          stats: {
            successes: 1,
            failures: 0,
            errors: 0,
            tokenUsage: {
              prompt: 0,
              completion: 0,
              cached: 0,
              total: 0,
              numRequests: 0,
              completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
              assertions: {
                total: 0,
                prompt: 0,
                completion: 0,
                cached: 0,
                numRequests: 0,
                completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
              },
            },
          },
        },
        config: { description: 'Test config' },
        shareableUrl: null,
        metadata: {
          evaluationCreatedAt: '2024-01-01T12:00:00.000Z',
          author: 'test-author',
        },
      };

      const mockEvalRecord = { id: 'test-eval-123' } as any;
      mockFs.readFileSync.mockReturnValue(JSON.stringify(v3Data));
      mockEval.create.mockResolvedValue(mockEvalRecord);
      mockEvalResult.createManyFromEvaluateResult.mockReturnValue([]);

      importCommand(program);

      await program.parseAsync(['node', 'test', 'import', 'test.json']);

      expect(mockEval.create).toHaveBeenCalledWith(
        v3Data.config,
        [
          {
            raw: 'test prompt',
            label: 'test prompt',
            id: 'prompt-id',
          },
        ],
        {
          id: 'test-eval-123',
          createdAt: new Date('2024-01-01T12:00:00.000Z'),
          author: 'test-author',
        },
      );
      expect(mockEvalResult.createManyFromEvaluateResult).toHaveBeenCalledWith(
        v3Data.results.results,
        'test-eval-123',
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Eval with ID test-eval-123 has been successfully imported.',
      );
    });

    it('should handle v3 format with fallback to legacy fields', async () => {
      const v3DataLegacy = {
        evalId: 'legacy-eval-456',
        results: {
          version: 3,
          timestamp: '2024-01-02T10:00:00.000Z',
          prompts: [],
          results: [],
          stats: {
            successes: 0,
            failures: 0,
            errors: 0,
            tokenUsage: {
              prompt: 0,
              completion: 0,
              cached: 0,
              total: 0,
              numRequests: 0,
              completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
              assertions: {
                total: 0,
                prompt: 0,
                completion: 0,
                cached: 0,
                numRequests: 0,
                completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
              },
            },
          },
        },
        config: { description: 'Legacy config' },
        shareableUrl: null,
        metadata: {
          evaluationCreatedAt: '2024-01-02T10:00:00.000Z',
          author: 'legacy-author',
        },
      };

      const mockEvalRecord = { id: 'legacy-eval-456' } as any;
      mockFs.readFileSync.mockReturnValue(JSON.stringify(v3DataLegacy));
      mockEval.create.mockResolvedValue(mockEvalRecord);
      mockEvalResult.createManyFromEvaluateResult.mockReturnValue([]);

      importCommand(program);

      await program.parseAsync(['node', 'test', 'import', 'legacy.json']);

      expect(mockEval.create).toHaveBeenCalledWith(v3DataLegacy.config, [], {
        id: 'legacy-eval-456',
        createdAt: new Date('2024-01-02T10:00:00.000Z'),
        author: 'legacy-author',
      });
    });

    it('should handle v3 format with missing metadata gracefully', async () => {
      const v3DataMinimal = {
        evalId: 'minimal-eval-789',
        results: {
          version: 3,
          prompts: [],
          results: [],
        },
        config: {},
      };

      const mockEvalRecord = { id: 'minimal-eval-789' } as any;
      mockFs.readFileSync.mockReturnValue(JSON.stringify(v3DataMinimal));
      mockEval.create.mockResolvedValue(mockEvalRecord);
      mockEvalResult.createManyFromEvaluateResult.mockReturnValue([]);

      importCommand(program);

      await program.parseAsync(['node', 'test', 'import', 'minimal.json']);

      expect(mockEval.create).toHaveBeenCalledWith(
        v3DataMinimal.config,
        v3DataMinimal.results.prompts,
        expect.objectContaining({
          id: 'minimal-eval-789',
          author: 'Unknown',
        }),
      );
    });
  });

  describe('v2 format import', () => {
    it('should import v2 format data correctly', async () => {
      const v2Data = {
        version: 2,
        id: 'v2-eval-123',
        createdAt: '2024-01-01T12:00:00.000Z',
        config: { description: 'V2 config' },
        results: {
          version: 2,
          results: [],
        },
      };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(v2Data));

      importCommand(program);

      await program.parseAsync(['node', 'test', 'import', 'v2test.json']);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Eval with ID v2-eval-123 has been successfully imported.',
      );
    });
  });

  describe('error handling', () => {
    it('should handle file read errors', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      importCommand(program);

      await program.parseAsync(['node', 'test', 'import', 'nonexistent.json']);

      expect(logger.error).toHaveBeenCalledWith('Failed to import eval: Error: File not found');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle JSON parse errors', async () => {
      mockFs.readFileSync.mockReturnValue('invalid json');

      importCommand(program);

      await program.parseAsync(['node', 'test', 'import', 'invalid.json']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to import eval:'));
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle Eval.create errors', async () => {
      const v3Data = {
        evalId: 'error-eval',
        results: { version: 3, prompts: [], results: [] },
        config: {},
        metadata: {},
      };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(v3Data));
      mockEval.create.mockRejectedValue(new Error('Database error'));

      importCommand(program);

      await program.parseAsync(['node', 'test', 'import', 'error.json']);

      expect(logger.error).toHaveBeenCalledWith('Failed to import eval: Error: Database error');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('telemetry', () => {
    it('should record telemetry with correct evalId for v3 format', async () => {
      const telemetry = require('../../src/telemetry');
      const v3Data = {
        evalId: 'telemetry-test',
        results: { version: 3, prompts: [], results: [] },
        config: {},
        metadata: {},
      };

      const mockEvalRecord = { id: 'telemetry-test' } as any;
      mockFs.readFileSync.mockReturnValue(JSON.stringify(v3Data));
      mockEval.create.mockResolvedValue(mockEvalRecord);
      mockEvalResult.createManyFromEvaluateResult.mockReturnValue([]);

      importCommand(program);

      await program.parseAsync(['node', 'test', 'import', 'telemetry.json']);

      expect(telemetry.record).toHaveBeenCalledWith('command_used', {
        name: 'import',
        evalId: 'telemetry-test',
      });
    });

    it('should record telemetry with fallback evalId for legacy format', async () => {
      const telemetry = require('../../src/telemetry');
      const legacyData = {
        id: 'legacy-telemetry',
        results: { version: 3, prompts: [], results: [] },
        config: {},
      };

      const mockEvalRecord = { id: 'legacy-telemetry' } as any;
      mockFs.readFileSync.mockReturnValue(JSON.stringify(legacyData));
      mockEval.create.mockResolvedValue(mockEvalRecord);
      mockEvalResult.createManyFromEvaluateResult.mockReturnValue([]);

      importCommand(program);

      await program.parseAsync(['node', 'test', 'import', 'legacy-telemetry.json']);

      expect(telemetry.record).toHaveBeenCalledWith('command_used', {
        name: 'import',
        evalId: 'legacy-telemetry',
      });
    });
  });
});
