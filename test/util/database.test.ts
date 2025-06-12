import { jest } from '@jest/globals';
import type { EvaluateTable } from '../../src/types';
import * as database from '../../src/util/database';

// Mock getDb
const getDb = jest.fn();
jest.mock('../../src/database', () => ({
  getDb,
}));

// Mock logger to silence output during tests
jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock createEvalId and Eval model
jest.mock('../../src/models/eval', () => {
  const mockEvalInstance = {
    id: 'test-eval-id',
    createdAt: Date.now(),
    getPrompts: () => [
      { raw: 'test prompt', label: 'test', provider: 'test-provider', metrics: { accuracy: 1 } },
    ],
    toResultsFile: () => ({
      version: 3,
      config: { tests: ['test1'] },
      results: [],
    }),
    getTable: () => ({ body: [] }),
    save: jest.fn(),
    setTable: jest.fn(),
    config: {},
  };
  return {
    __esModule: true,
    default: jest.fn(() => mockEvalInstance),
    findById: jest.fn(() => ({
      ...mockEvalInstance,
      id: 'test-id',
    })),
    latest: jest.fn(() => ({
      ...mockEvalInstance,
      id: 'latest-id',
    })),
    getMany: jest.fn(() => [
      {
        ...mockEvalInstance,
        id: 'test-eval-id',
      },
    ]),
    createEvalId: jest.fn(() => 'eval-created-id'),
  };
});

// Mock getAuthor
jest.mock('../../src/globalConfig/accounts', () => ({
  getAuthor: jest.fn(() => 'test-author'),
}));

// Mock generateIdFromPrompt
jest.mock('../../src/models/prompt', () => ({
  generateIdFromPrompt: jest.fn(() => 'prompt-id'),
}));

// Mock sha256
jest.mock('../../src/util/createHash', () => ({
  sha256: jest.fn((input: string) => {
    if (input.startsWith('["test1"]')) {
      return 'dataset-id';
    }
    if (input === 'test prompt') {
      return 'prompt-id';
    }
    if (input === 'test1') {
      return 'hash-test1';
    }
    if (input === '{"env":"test"}') {
      return 'tag-id';
    }
    if (input === '["test1"]') {
      return 'dataset-id';
    }
    return 'sha256-' + input;
  }),
}));

// Mock invariant (noop)
jest.mock('../../src/util/invariant', () => ({
  __esModule: true,
  default: (condition: any, msg: string) => {
    if (!condition) {
      throw new Error(msg);
    }
  },
}));

// Mock all table objects
jest.mock('../../src/database/tables', () => ({
  datasetsTable: { name: 'datasets', id: 'id', tests: 'tests' },
  evalsTable: {
    name: 'evals',
    id: 'id',
    createdAt: 'createdAt',
    author: 'author',
    results: 'results',
    config: 'config',
    description: 'description',
  },
  evalsToDatasetsTable: { name: 'evals_to_datasets', evalId: 'evalId', datasetId: 'datasetId' },
  evalsToPromptsTable: { name: 'evals_to_prompts', evalId: 'evalId', promptId: 'promptId' },
  evalsToTagsTable: { name: 'evals_to_tags', evalId: 'evalId', tagId: 'tagId' },
  promptsTable: { name: 'prompts', id: 'id', prompt: 'prompt' },
  tagsTable: { id: 'id', value: 'value', name: 'tag_name' } as any,
  evalResultsTable: { name: 'eval_results', evalId: 'evalId' },
}));

// Mock drizzle-orm primitives (eq, desc, and, sql)
jest.mock('drizzle-orm', () => ({
  eq: jest.fn((a, b) => ({ eq: [a, b] })),
  desc: jest.fn((a) => a),
  and: jest.fn((...args) => args.filter(Boolean)),
  sql: jest.fn((...args) => args.join('')),
}));

describe('database utils', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      transaction: jest.fn((fn: Function) => fn()),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      run: jest.fn().mockReturnValue({ changes: 1 }),
      delete: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      all: jest.fn().mockReturnValue([
        {
          evalId: 'test-id',
          description: 'test description',
          config: { description: 'test description' },
          results: {},
          createdAt: Date.now(),
          isRedteam: false,
          promptId: 'prompt-id',
          datasetId: 'dataset-id',
          tagName: 'env',
          tagValue: 'test',
        },
      ]),
    };

    getDb.mockReturnValue(mockDb);

    // Patch Eval.getMany etc. for all tests

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const evalModule = require('../../src/models/eval');
    evalModule.getMany.mockImplementation(() => [
      {
        id: 'test-eval-id',
        createdAt: Date.now(),
        getPrompts: () => [
          {
            raw: 'test prompt',
            label: 'test',
            provider: 'test-provider',
            metrics: { accuracy: 1 },
          },
        ],
        toResultsFile: () => ({
          version: 3,
          config: { tests: ['test1'] },
          results: [],
        }),
        getTable: () => ({ body: [] }),
      },
    ]);
    evalModule.findById.mockImplementation(() => ({
      id: 'test-id',
      createdAt: Date.now(),
      getPrompts: () => [
        { raw: 'test prompt', label: 'test', provider: 'test-provider', metrics: { accuracy: 1 } },
      ],
      toResultsFile: () => ({
        version: 3,
        config: { tests: ['test1'] },
        results: [],
      }),
      getTable: () => ({ body: [] }),
      save: jest.fn(),
      setTable: jest.fn(),
      config: {},
    }));
    evalModule.latest.mockImplementation(() => ({
      id: 'latest-id',
      createdAt: Date.now(),
      getPrompts: () => [
        { raw: 'test prompt', label: 'test', provider: 'test-provider', metrics: { accuracy: 1 } },
      ],
      toResultsFile: () => ({
        version: 3,
        config: { tests: ['test1'] },
        results: [],
      }),
      getTable: () => ({ body: [] }),
      save: jest.fn(),
      setTable: jest.fn(),
      config: {},
    }));
  });

  describe('getStandaloneEvals', () => {
    it('should use cache if available', async () => {
      const cacheKey = 'standalone_evals_100_undefined_undefined';
      const cached = [
        {
          evalId: 'cached-id',
          uuid: 'uuid',
          description: 'desc',
          pluginFailCount: {},
          pluginPassCount: {},
          isRedteam: false,
          createdAt: 0,
          promptId: null,
          datasetId: null,
        },
      ] as any;
      database.standaloneEvalCache.set(cacheKey, cached);
      const evals = await database.getStandaloneEvals();
      expect(evals).toEqual(cached);
      database.standaloneEvalCache.del(cacheKey);
    });
  });

  describe('readResult', () => {
    it('should return undefined if eval not found', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const evalModule = require('../../src/models/eval');
      evalModule.findById.mockReturnValueOnce(undefined);
      const result = await database.readResult('not-found');
      expect(result).toBeUndefined();
    });
  });

  describe('updateResult', () => {
    it('should update result config', async () => {
      await database.updateResult('test-id', { description: 'updated' });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should update result table', async () => {
      const table: EvaluateTable = {
        head: { prompts: [], vars: [] },
        body: [],
      };
      await database.updateResult('test-id', undefined, table);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should return if eval not found', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const evalModule = require('../../src/models/eval');
      evalModule.findById.mockReturnValueOnce(undefined);
      await database.updateResult('not-found', { description: 'updated' });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });
});
