import { fetchWithTimeout } from '../../../src/fetch';
import logger from '../../../src/logger';
import {
  DoNotAnswerPlugin,
  parseCSV,
  parseCSVRow,
  PLUGIN_ID,
  fetchDataset,
} from '../../../src/redteam/plugins/donotanswer';

jest.mock('fs');
jest.mock('../../../src/fetch');
jest.mock('../../../src/logger');

describe('DoNotAnswerPlugin', () => {
  let plugin: DoNotAnswerPlugin;

  beforeEach(() => {
    jest.resetAllMocks();
    plugin = new DoNotAnswerPlugin({} as any, 'test', 'input');
  });

  describe('parseCSVRow', () => {
    it('should parse a simple CSV row correctly', () => {
      const header = ['id', 'question'];
      const row = '1,test question';
      const result = parseCSVRow(header, row);
      expect(result).toEqual({
        id: '1',
        question: 'test question',
      });
    });

    it('should handle quoted fields', () => {
      const header = ['id', 'question'];
      const row = '1,"test, with comma"';
      const result = parseCSVRow(header, row);
      expect(result).toEqual({
        id: '1',
        question: 'test, with comma',
      });
    });

    it('should return null if number of values does not match header', () => {
      const header = ['id', 'question'];
      const row = '1';
      const result = parseCSVRow(header, row);
      expect(result).toBeNull();
    });
  });

  describe('parseCSV', () => {
    it('should parse CSV data correctly', () => {
      const csvData = 'id,question\n1,test1\n2,test2';
      const result = parseCSV(csvData);
      expect(result).toEqual([
        { id: '1', question: 'test1' },
        { id: '2', question: 'test2' },
      ]);
    });

    it('should skip empty lines', () => {
      const csvData = 'id,question\n1,test1\n\n2,test2\n';
      const result = parseCSV(csvData);
      expect(result).toEqual([
        { id: '1', question: 'test1' },
        { id: '2', question: 'test2' },
      ]);
    });

    it('should return empty array for invalid CSV', () => {
      const csvData = 'single line';
      const result = parseCSV(csvData);
      expect(result).toEqual([]);
    });
  });

  describe('fetchDataset', () => {
    it('should fetch and parse dataset correctly', async () => {
      const mockData = `id,risk_area,types_of_harm,specific_harms,question
1,test_area,test_harm,specific,test_question`;

      jest.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        vars: {
          risk_area: 'test_area',
          types_of_harm: 'test_harm',
          specific_harms: 'specific',
          question: 'test_question',
        },
      });
    });

    it('should handle fetch errors gracefully', async () => {
      jest.mocked(fetchWithTimeout).mockRejectedValue(new Error('Fetch failed'));
      const result = await fetchDataset(1);
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching dataset'));
    });
  });

  describe('DoNotAnswerPlugin class', () => {
    it('should have correct plugin ID', () => {
      expect(plugin.id).toBe(PLUGIN_ID);
    });

    it('should throw error for getTemplate', async () => {
      await expect(plugin.getTemplate()).rejects.toThrow('Not implemented');
    });

    it('should return correct assertions', () => {
      const prompt = 'test prompt';
      const assertions = plugin.getAssertions(prompt);
      expect(assertions).toHaveLength(1);
      expect(assertions[0]).toMatchObject({
        metric: 'DoNotAnswer',
        type: 'llm-rubric',
      });
    });

    it('should generate tests correctly', async () => {
      const mockData = `id,risk_area,types_of_harm,specific_harms,question
1,test_area,test_harm,specific,test_question`;

      jest.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const tests = await plugin.generateTests(1);
      expect(tests).toHaveLength(1);
      expect(tests[0]).toMatchObject({
        vars: {
          input: 'test_question',
        },
        metadata: {
          risk_area: 'test_area',
          types_of_harm: 'test_harm',
          specific_harms: 'specific',
          pluginId: 'donotanswer',
        },
      });
    });

    it('should handle fetch errors gracefully in generateTests', async () => {
      jest.mocked(fetchWithTimeout).mockRejectedValue(new Error('Fetch failed'));
      const tests = await plugin.generateTests(1);
      expect(tests).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching dataset'));
    });
  });
});
