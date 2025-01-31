import { getDb } from '../../../src/database';
import {
  deduplicateTests,
  getFailedTestCases,
  addRetryTestCases,
} from '../../../src/redteam/strategies/retry';
import type { TestCase } from '../../../src/types';

jest.mock('../../../src/database');
jest.mock('../../../src/logger');

describe('retry strategy', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('deduplicateTests', () => {
    it('should remove duplicate test cases based on vars', () => {
      const tests = [
        { vars: { a: 1, b: 2 } },
        { vars: { a: 1, b: 2 } }, // duplicate
        { vars: { a: 2, b: 3 } },
      ];

      const result = deduplicateTests(tests);
      expect(result).toHaveLength(2);
      expect(result).toEqual([{ vars: { a: 1, b: 2 } }, { vars: { a: 2, b: 3 } }]);
    });

    it('should handle empty array', () => {
      const result = deduplicateTests([]);
      expect(result).toEqual([]);
    });
  });

  describe('getFailedTestCases', () => {
    it('should return empty array when no failed test cases found', async () => {
      const mockDb: any = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };
      jest.mocked(getDb).mockReturnValue(mockDb);

      const result = await getFailedTestCases('plugin1', 'target1');
      expect(result).toEqual([]);
    });

    it('should return deduplicated failed test cases', async () => {
      const mockFailedResults = [
        {
          testCase: JSON.stringify({
            vars: { a: 1 },
            metadata: { pluginId: 'plugin1' },
          }),
        },
        {
          testCase: JSON.stringify({
            vars: { a: 1 }, // duplicate
            metadata: { pluginId: 'plugin1' },
          }),
        },
      ];

      const mockDb: any = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValueOnce([{ success: 0 }])
          .mockResolvedValueOnce(mockFailedResults),
      };
      jest.mocked(getDb).mockReturnValue(mockDb);

      const result = await getFailedTestCases('plugin1', 'target1');
      expect(result).toHaveLength(1);
    });

    it('should handle invalid JSON in test cases', async () => {
      const mockFailedResults = [
        {
          testCase: 'invalid json',
        },
      ];

      const mockDb: any = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValueOnce([{ success: 0 }])
          .mockResolvedValueOnce(mockFailedResults),
      };
      jest.mocked(getDb).mockReturnValue(mockDb);

      const result = await getFailedTestCases('plugin1', 'target1');
      expect(result).toEqual([]);
    });
  });

  describe('addRetryTestCases', () => {
    it('should throw error when no target labels provided', async () => {
      const testCases = [
        {
          metadata: { pluginId: 'plugin1' },
          vars: {},
        },
      ];

      await expect(addRetryTestCases(testCases, 'var1', {})).rejects.toThrow(
        'No target labels found in config. The retry strategy requires at least one target label to be specified.',
      );
    });

    it('should add retry test cases for each plugin and target', async () => {
      const testCases = [
        {
          metadata: { pluginId: 'plugin1' },
          vars: {},
        },
      ];

      const config = {
        targetLabels: ['target1', 'target2'],
        numTests: 1,
      };

      const mockFailedTestCase: TestCase = {
        vars: { a: 1 },
        metadata: { pluginId: 'plugin1' },
      };

      const mockDb: any = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValueOnce([{ success: 0 }])
          .mockResolvedValueOnce([{ testCase: JSON.stringify(mockFailedTestCase) }]),
      };
      jest.mocked(getDb).mockReturnValue(mockDb);

      const result = await addRetryTestCases(testCases, 'var1', config);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockFailedTestCase);
    });

    it('should handle no failed test cases', async () => {
      const testCases = [
        {
          metadata: { pluginId: 'plugin1' },
          vars: {},
        },
      ];

      const config = {
        targetLabels: ['target1'],
      };

      const mockDb: any = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };
      jest.mocked(getDb).mockReturnValue(mockDb);

      const result = await addRetryTestCases(testCases, 'var1', config);
      expect(result).toEqual([]);
    });
  });
});
