import { getDb } from '../../src/database';
import Eval from '../../src/models/eval';
import { getSummaryOfLatestEvals } from '../../src/models/eval';
import {
  writeResultsToDatabase,
  listPreviousResults,
  readResult,
  updateResult,
  deleteEval,
  deleteAllEvals,
  getStandaloneEvals,
} from '../../src/util';

jest.mock('../../src/database');
jest.mock('../../src/models/eval');

describe('database operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('writeResultsToDatabase', () => {
    it('should write results and related data to database', async () => {
      const mockDb = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        onConflictDoNothing: jest.fn().mockReturnThis(),
        run: jest.fn().mockResolvedValue({}),
      };
      jest.mocked(getDb).mockReturnValue(mockDb as any);

      const results = {
        table: {
          head: {
            prompts: [{ label: 'Test Prompt', raw: 'test' }],
          },
        },
      };
      const config = {
        description: 'Test Config',
        tests: [{ vars: { test: 'value' } }],
        tags: { key: 'value' },
      };

      await writeResultsToDatabase(results as any, config);

      expect(mockDb.insert).toHaveBeenCalledWith(expect.any(Object));
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test Config',
          config,
          results,
          author: null,
        }),
      );
      expect(mockDb.onConflictDoNothing).toHaveBeenCalledWith();
      expect(mockDb.run).toHaveBeenCalledWith();
    });
  });

  describe('listPreviousResults', () => {
    it('should return list of previous results', async () => {
      const mockResults = [
        {
          evalId: 'test1',
          createdAt: Date.now(),
          description: 'Test 1',
          numTests: 1,
          datasetId: 'dataset1',
          isRedteam: false,
        },
      ];

      const mockDb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        all: jest.fn().mockReturnValue(mockResults),
      };

      jest.mocked(getDb).mockReturnValue(mockDb as any);
      jest.mocked(getSummaryOfLatestEvals).mockResolvedValue([]);

      const results = await listPreviousResults(10);
      expect(results).toEqual(mockResults);
      expect(mockDb.select).toHaveBeenCalledWith({
        evalId: expect.any(Object),
        createdAt: expect.any(Object),
        description: expect.any(Object),
        numTests: expect.any(Object),
        datasetId: expect.any(Object),
        isRedteam: expect.any(Object),
      });
      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('readResult and updateResult', () => {
    it('should read and update results', async () => {
      const mockEval = {
        id: 'test1',
        createdAt: Date.now(),
        config: { description: 'Test' },
        toResultsFile: jest.fn().mockResolvedValue({ config: { description: 'Test' } }),
        save: jest.fn().mockResolvedValue(undefined),
      };

      jest.spyOn(Eval, 'findById').mockResolvedValue(mockEval as any);

      const result = await readResult('test1');
      expect(result).toBeDefined();
      expect(result?.id).toBe('test1');

      await updateResult('test1', { description: 'Updated Test' });
      expect(mockEval.save).toHaveBeenCalledWith();
    });
  });

  describe('deleteEval and deleteAllEvals', () => {
    it('should delete single and all evals', async () => {
      const mockDelete = jest.fn().mockReturnThis();
      const mockRun = jest.fn().mockResolvedValue({ changes: 1 });
      const mockWhere = jest.fn().mockReturnThis();

      const mockDb = {
        transaction: jest.fn().mockImplementation(async (fn) => {
          const tx = {
            delete: mockDelete,
            where: mockWhere,
            run: mockRun,
          };
          await fn(tx);
        }),
        delete: mockDelete,
        where: mockWhere,
        run: mockRun,
      };

      jest.mocked(getDb).mockReturnValue(mockDb as any);

      await deleteEval('test1');
      expect(mockDelete).toHaveBeenCalledWith(expect.any(Object));
      expect(mockWhere).toHaveBeenCalledWith(expect.any(Object));
      expect(mockRun).toHaveBeenCalledWith();

      await deleteAllEvals();
      expect(mockDb.transaction).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('getStandaloneEvals', () => {
    it('should return standalone evals with caching', async () => {
      const mockResults = [
        {
          evalId: 'test1',
          description: 'Test 1',
          results: {},
          createdAt: Date.now(),
          promptId: 'prompt1',
          datasetId: 'dataset1',
          tagName: 'tag1',
          tagValue: 'value1',
          isRedteam: false,
        },
      ];

      const mockDb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        all: jest.fn().mockReturnValue(mockResults),
      };

      const mockEvalInstance = {
        getPrompts: jest.fn().mockReturnValue([
          {
            provider: 'test',
            raw: 'test prompt',
            label: 'Test Prompt',
          },
        ]),
        getTable: jest.fn().mockResolvedValue({
          body: [
            {
              test: { metadata: { pluginId: 'test' } },
              outputs: [{ pass: true }],
            },
          ],
        }),
      };

      jest.mocked(getDb).mockReturnValue(mockDb as any);
      jest.spyOn(Eval, 'findById').mockResolvedValue(mockEvalInstance as any);

      const evals = await getStandaloneEvals({ limit: 10 });
      expect(evals).toBeDefined();
      expect(Array.isArray(evals)).toBe(true);
      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });
  });
});
