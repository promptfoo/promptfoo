import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import {
  fetchDataset,
  OpenAIGuardrailsPlugin,
} from '../../../src/redteam/plugins/openaiGuardrails';
import { fetchWithTimeout } from '../../../src/util/fetch/index';

vi.mock('../../../src/util/fetch');
vi.mock('../../../src/logger');

describe('OpenAIGuardrailsPlugin', () => {
  let plugin: OpenAIGuardrailsPlugin;

  beforeEach(() => {
    vi.resetAllMocks();
    plugin = new OpenAIGuardrailsPlugin({} as any, 'test', 'input');
  });

  describe('fetchDataset', () => {
    it('should fetch and parse JSONL dataset correctly', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Test jailbreak prompt 1"}
{"id":"jailbreak-01931","expected_triggers":{"Jailbreak":true},"data":"Test jailbreak prompt 2"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(2);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        vars: {
          prompt: expect.stringMatching(/Test jailbreak prompt/),
          id: expect.stringMatching(/jailbreak-0193/),
        },
      });
    });

    it('should filter for Jailbreak expected triggers only', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Test jailbreak"}
{"id":"safe-00001","expected_triggers":{"Jailbreak":false},"data":"Safe prompt"}
{"id":"jailbreak-01931","expected_triggers":{"Jailbreak":true},"data":"Another jailbreak"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(10);
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.vars.id.startsWith('jailbreak'))).toBe(true);
    });

    it('should handle empty lines in JSONL', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Test jailbreak"}

{"id":"jailbreak-01931","expected_triggers":{"Jailbreak":true},"data":"Another jailbreak"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(10);
      expect(result).toHaveLength(2);
    });

    it('should shuffle and limit results', async () => {
      const mockData = Array.from({ length: 100 }, (_, i) => ({
        id: `jailbreak-${i}`,
        expected_triggers: { Jailbreak: true },
        data: `Test jailbreak prompt ${i}`,
      }))
        .map((obj) => JSON.stringify(obj))
        .join('\n');

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(5);
      expect(result).toHaveLength(5);
    });

    it('should handle fetch errors gracefully', async () => {
      vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('Fetch failed'));
      const result = await fetchDataset(1);
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching dataset'));
    });

    it('should handle malformed JSONL', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Test"}
{this is not valid json}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(10);
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('OpenAIGuardrailsPlugin class', () => {
    it('should have correct plugin ID', () => {
      expect(plugin.id).toBe('promptfoo:redteam:openai-guardrails');
    });

    it('should set canGenerateRemote to false', () => {
      expect(OpenAIGuardrailsPlugin.canGenerateRemote).toBe(false);
    });

    it('should throw error for getTemplate', async () => {
      await expect(plugin.getTemplate()).rejects.toThrow('Not implemented');
    });

    it('should return correct assertions', () => {
      const prompt = 'test jailbreak prompt';
      const assertions = plugin.getAssertions(prompt);
      expect(assertions).toHaveLength(1);
      expect(assertions[0]).toMatchObject({
        metric: 'OpenAI Guardrails',
        type: 'llm-rubric',
      });
      expect(assertions[0].value).toContain('jailbreak');
      expect(assertions[0].value).toContain(prompt);
    });

    it('should return safe prompt assertions when isSafe is true', () => {
      const prompt = 'What is the weather today?';
      const assertions = plugin.getAssertions(prompt, true);
      expect(assertions).toHaveLength(1);
      expect(assertions[0].type).toBe('llm-rubric');
      expect(assertions[0].value).toContain('SAFE request');
    });

    it('should generate tests correctly', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Test jailbreak prompt"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const tests = await plugin.generateTests(1);
      expect(tests).toHaveLength(1);
      expect(tests[0]).toMatchObject({
        vars: {
          input: 'Test jailbreak prompt',
        },
        metadata: {
          id: 'jailbreak-01930',
          pluginId: 'openai-guardrails',
        },
      });
      expect(tests[0].assert).toHaveLength(1);
    });

    it('should handle fetch errors gracefully in generateTests', async () => {
      vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('Fetch failed'));
      const tests = await plugin.generateTests(1);
      expect(tests).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching dataset'));
    });
  });

  describe('includeSafe option', () => {
    it('should include both safe and jailbreak prompts when includeSafe is true', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Jailbreak prompt 1"}
{"id":"jailbreak-01931","expected_triggers":{"Jailbreak":true},"data":"Jailbreak prompt 2"}
{"id":"safe-00001","expected_triggers":{"Jailbreak":false},"data":"Safe prompt 1"}
{"id":"safe-00002","expected_triggers":{"Jailbreak":false},"data":"Safe prompt 2"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(4, true);
      expect(result).toHaveLength(4);

      const safeCount = result.filter((r) => r.vars.isSafe).length;
      const jailbreakCount = result.filter((r) => !r.vars.isSafe).length;
      expect(safeCount).toBe(2);
      expect(jailbreakCount).toBe(2);
    });

    it('should balance safe and jailbreak prompts 50/50', async () => {
      const jailbreakData = Array.from({ length: 20 }, (_, i) => ({
        id: `jailbreak-${i}`,
        expected_triggers: { Jailbreak: true },
        data: `Jailbreak prompt ${i}`,
      }));
      const safeData = Array.from({ length: 20 }, (_, i) => ({
        id: `safe-${i}`,
        expected_triggers: { Jailbreak: false },
        data: `Safe prompt ${i}`,
      }));
      const mockData = [...jailbreakData, ...safeData].map((obj) => JSON.stringify(obj)).join('\n');

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(10, true);
      const safeCount = result.filter((r) => r.vars.isSafe).length;
      const jailbreakCount = result.filter((r) => !r.vars.isSafe).length;

      expect(safeCount).toBe(5);
      expect(jailbreakCount).toBe(5);
    });

    it('should generate tests with correct metadata when includeSafe is true', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Jailbreak prompt"}
{"id":"safe-00001","expected_triggers":{"Jailbreak":false},"data":"Safe prompt"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const pluginWithIncludeSafe = new OpenAIGuardrailsPlugin({} as any, 'test', 'input', {
        includeSafe: true,
      });
      const tests = await pluginWithIncludeSafe.generateTests(2);

      expect(tests).toHaveLength(2);

      const safeTest = tests.find((test) => test.metadata?.isSafe);
      const jailbreakTest = tests.find((test) => !test.metadata?.isSafe);

      expect(safeTest).toBeDefined();
      expect(safeTest?.metadata).toMatchObject({
        isSafe: true,
        label: 'safe',
      });

      expect(jailbreakTest).toBeDefined();
      expect(jailbreakTest?.metadata).toMatchObject({
        isSafe: false,
        label: 'jailbreak',
      });
    });

    it('should use inverted assertions for safe prompts', async () => {
      const mockData = `{"id":"safe-00001","expected_triggers":{"Jailbreak":false},"data":"What is the weather today?"}
{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Jailbreak attempt"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const pluginWithIncludeSafe = new OpenAIGuardrailsPlugin({} as any, 'test', 'input', {
        includeSafe: true,
      });
      const tests = await pluginWithIncludeSafe.generateTests(2);

      const safeTest = tests.find((test) => test.metadata?.isSafe);
      expect(safeTest).toBeDefined();

      const safeAssertion = safeTest?.assert?.[0];
      expect(safeAssertion?.type).toBe('llm-rubric');
      expect(safeAssertion?.metric).toBe('OpenAI Guardrails');
      if (safeAssertion && 'value' in safeAssertion && typeof safeAssertion.value === 'string') {
        expect(safeAssertion.value).toContain('SAFE request');
        expect(safeAssertion.value).toContain('should be answered helpfully');
      }
    });

    it('should use standard assertions for jailbreak prompts', async () => {
      const mockData = `{"id":"safe-00001","expected_triggers":{"Jailbreak":false},"data":"What is the weather today?"}
{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Jailbreak attempt"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const pluginWithIncludeSafe = new OpenAIGuardrailsPlugin({} as any, 'test', 'input', {
        includeSafe: true,
      });
      const tests = await pluginWithIncludeSafe.generateTests(2);

      const jailbreakTest = tests.find((test) => !test.metadata?.isSafe);
      expect(jailbreakTest).toBeDefined();

      const jailbreakAssertion = jailbreakTest?.assert?.[0];
      expect(jailbreakAssertion?.type).toBe('llm-rubric');
      expect(jailbreakAssertion?.metric).toBe('OpenAI Guardrails');
      if (
        jailbreakAssertion &&
        'value' in jailbreakAssertion &&
        typeof jailbreakAssertion.value === 'string'
      ) {
        expect(jailbreakAssertion.value).toContain('jailbreak attempt');
      }
    });

    it('should exclude safe prompts when includeSafe is false', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Jailbreak prompt"}
{"id":"safe-00001","expected_triggers":{"Jailbreak":false},"data":"Safe prompt"}
{"id":"jailbreak-01931","expected_triggers":{"Jailbreak":true},"data":"Another jailbreak"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(10, false);
      expect(result.every((r) => !r.vars.isSafe)).toBe(true);
    });
  });
});
