import Eval from '../../src/models/eval';
import {
  getPromptFromHash,
  getDatasetFromHash,
  getPrompts,
  getPromptsForTestCases,
  getPromptsForTestCasesHash,
  getTestCases,
} from '../../src/util/database';

jest.mock('../../src/models/eval');

describe('database utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPromptsForTestCasesHash', () => {
    it('should call getPromptsWithPredicate with correct hash', async () => {
      const testHash = 'abc123';
      const limit = 10;

      jest.mocked(Eval.getMany).mockResolvedValue([]);

      const result = await getPromptsForTestCasesHash(testHash, limit);

      expect(result).toEqual([]);
      expect(Eval.getMany).toHaveBeenCalledWith(limit);
    });
  });

  describe('getPromptsForTestCases', () => {
    it('should generate hash and call getPromptsForTestCasesHash', async () => {
      const testCases = [{ vars: { test: 'value' } }];

      jest.mocked(Eval.getMany).mockResolvedValue([]);

      const result = await getPromptsForTestCases(testCases);

      expect(result).toEqual([]);
      expect(Eval.getMany).toHaveBeenCalledWith(100);
    });
  });

  describe('getPrompts', () => {
    it('should call getPromptsWithPredicate with default limit', async () => {
      jest.mocked(Eval.getMany).mockResolvedValue([]);

      const result = await getPrompts();

      expect(result).toEqual([]);
      expect(Eval.getMany).toHaveBeenCalledWith(100);
    });

    it('should call getPromptsWithPredicate with custom limit', async () => {
      const limit = 5;
      jest.mocked(Eval.getMany).mockResolvedValue([]);

      const result = await getPrompts(limit);

      expect(result).toEqual([]);
      expect(Eval.getMany).toHaveBeenCalledWith(limit);
    });
  });

  describe('getTestCases', () => {
    it('should call getTestCasesWithPredicate with default limit', async () => {
      jest.mocked(Eval.getMany).mockResolvedValue([]);

      const result = await getTestCases();

      expect(result).toEqual([]);
      expect(Eval.getMany).toHaveBeenCalledWith(100);
    });

    it('should call getTestCasesWithPredicate with custom limit', async () => {
      const limit = 5;
      jest.mocked(Eval.getMany).mockResolvedValue([]);

      const result = await getTestCases(limit);

      expect(result).toEqual([]);
      expect(Eval.getMany).toHaveBeenCalledWith(limit);
    });
  });

  describe('getPromptFromHash', () => {
    it('should return undefined if no match found', async () => {
      jest.mocked(Eval.getMany).mockResolvedValue([]);

      const result = await getPromptFromHash('nonexistent');

      expect(result).toBeUndefined();
      expect(Eval.getMany).toHaveBeenCalledWith(100);
    });
  });

  describe('getDatasetFromHash', () => {
    it('should return undefined if no match found', async () => {
      jest.mocked(Eval.getMany).mockResolvedValue([]);

      const result = await getDatasetFromHash('nonexistent');

      expect(result).toBeUndefined();
      expect(Eval.getMany).toHaveBeenCalledWith(100);
    });
  });
});
