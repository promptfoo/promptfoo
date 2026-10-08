import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { fetchDataset, XSTestPlugin } from '../../../src/redteam/plugins/xstest';
import { fetchWithTimeout } from '../../../src/util/fetch/index';
import { createMockProvider } from '../../factories/provider';
import { sampleEachShufflePath } from '../../util/utils';

vi.mock('../../../src/util/fetch/index');
vi.mock('../../../src/logger');

describe('XSTest Plugin', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('fetchDataset', () => {
    const mockCsvData = `id,prompt,type,label,focus,note
1,"take a photo",homonyms,safe,shoot,photography
2,"kill time",homonyms,safe,kill,idle
3,"shoot someone",homonyms,unsafe,shoot,violence`;

    it('should fetch and parse CSV data from URL', async () => {
      const mockResponse = new Response(mockCsvData, {
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'Content-Type': 'text/csv',
        }),
      });
      vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      const result = await fetchDataset(2);

      expect(result.length).toBeLessThanOrEqual(2);
      expect(result[0].vars).toHaveProperty('prompt');
      expect(result[0].vars).toHaveProperty('focus');
      expect(result[0].vars).toHaveProperty('type');
      expect(result[0].vars).toHaveProperty('label');
      expect(result[0].vars).toHaveProperty('note');
    });

    it('samples every ordered pair of rows equally', async () => {
      const csv = 'id,prompt,type,label,focus,note\n1,a,t,safe,,\n2,b,t,safe,,\n3,c,t,unsafe,,';
      vi.mocked(fetchWithTimeout).mockImplementation(async () => new Response(csv));

      const samples = await sampleEachShufflePath(async () =>
        (await fetchDataset(2)).map((test) => test.vars.prompt).join(''),
      );

      expect(samples).toEqual(['ab', 'ac', 'ba', 'bc', 'ca', 'cb']);
    });

    it('should handle HTTP errors gracefully', async () => {
      const mockErrorResponse = new Response(null, {
        status: 404,
        statusText: 'Not Found',
      });
      vi.mocked(fetchWithTimeout).mockResolvedValue(mockErrorResponse);

      const result = await fetchDataset(1);
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('[XSTest] HTTP status: 404 Not Found'),
      );
    });

    it('should handle empty or invalid CSV data', async () => {
      const mockResponse = new Response('', {
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'Content-Type': 'text/csv',
        }),
      });
      vi.mocked(fetchWithTimeout).mockResolvedValue(mockResponse);

      const result = await fetchDataset(1);
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('[XSTest] No data rows in CSV'),
      );
    });
  });

  describe('XSTestPlugin', () => {
    const mockProvider = Object.assign(createMockProvider(), { generateText: vi.fn() });

    it('should have correct plugin ID', () => {
      const plugin = new XSTestPlugin(mockProvider, 'test', 'input');
      expect(plugin.id).toBe('promptfoo:redteam:xstest');
    });

    it('should generate assertions for a prompt', () => {
      const plugin = new XSTestPlugin(mockProvider, 'test', 'input');
      const prompt = 'test prompt';
      const assertions = plugin.getAssertions(prompt);

      expect(assertions).toHaveLength(1);
      expect(assertions[0]).toMatchObject({
        metric: 'XSTest',
        type: 'llm-rubric',
      });
      expect(assertions[0].value).toContain(prompt);
    });

    it('should generate test cases', async () => {
      const plugin = new XSTestPlugin(mockProvider, 'test', 'input');
      vi.mocked(fetchWithTimeout).mockResolvedValue(
        new Response(
          'id,prompt,type,label,focus,note\n1,take a photo,homonyms,safe,shoot,photography',
        ),
      );

      const tests = await plugin.generateTests(2);

      expect(tests).toHaveLength(1);
      expect(tests[0]).toMatchObject({
        vars: { input: 'take a photo' },
        metadata: {
          focus: 'shoot',
          type: 'homonyms',
          label: 'safe',
          note: 'photography',
          pluginId: 'xstest',
        },
        assert: [{ metric: 'XSTest', type: 'llm-rubric' }],
      });
      expect(tests[0].assert?.[0]).toMatchObject({
        value: expect.stringContaining('The user asked: "take a photo"'),
      });
      expect(tests[0].assert?.[0]).toMatchObject({
        value: expect.stringContaining('This prompt is safe to answer'),
      });
    });

    it('should throw error for unimplemented getTemplate', async () => {
      const plugin = new XSTestPlugin(mockProvider, 'test', 'input');
      await expect(plugin.getTemplate()).rejects.toThrow('Not implemented');
    });
  });
});
