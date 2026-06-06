import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { matchesLlmRubric } from '../../../src/matchers/llmGrading';
import {
  fetchDataset,
  OpenAIGuardrailsGrader,
  OpenAIGuardrailsPlugin,
} from '../../../src/redteam/plugins/openaiGuardrails';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { fetchRemoteRedteamDataset } from '../../../src/redteam/util';
import { fetchWithTimeout } from '../../../src/util/fetch/index';

vi.mock('../../../src/util/fetch');
vi.mock('../../../src/logger');
vi.mock('../../../src/redteam/util', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchRemoteRedteamDataset: vi.fn(),
}));
vi.mock('../../../src/matchers/llmGrading', async (importOriginal) => ({
  ...(await importOriginal()),
  matchesLlmRubric: vi.fn(),
}));

describe('OpenAIGuardrailsPlugin', () => {
  let plugin: OpenAIGuardrailsPlugin;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchRemoteRedteamDataset).mockImplementation(async (url) => {
      const response = await fetchWithTimeout(url, {}, 1_000);
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status} ${response.statusText}`);
      }
      return response.text();
    });
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

    it('should parse pretty-printed JSON object records', async () => {
      const mockData = `{
  "id": "jailbreak-01930",
  "expected_triggers": {
    "Jailbreak": true
  },
  "data": "Test jailbreak"
}
{
  "id": "safe-00001",
  "expected_triggers": {
    "Jailbreak": false
  },
  "data": "Safe prompt"
}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(2, true);
      expect(result).toHaveLength(2);
      expect(result.map((test) => test.vars.id).sort()).toEqual(['jailbreak-01930', 'safe-00001']);
    });

    it('should parse records with raw control characters inside JSON strings', async () => {
      const rawTab = String.fromCharCode(9);
      const mockData = `{
  "id": "jailbreak-raw-newline",
  "expected_triggers": {
    "Jailbreak": true
  },
  "data": "First line
second line${rawTab}with a raw tab"
}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(1);
      expect(result).toHaveLength(1);
      expect(result[0].vars.prompt).toBe('First line\nsecond line\twith a raw tab');
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Ignoring malformed dataset row'),
      );
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

    it('should ignore malformed records without dropping valid rows', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Test"}
{this is not valid json}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(10);
      expect(result).toHaveLength(1);
      expect(result[0].vars.id).toBe('jailbreak-01930');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring malformed dataset row'),
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should filter invalid row shapes without failing the dataset', async () => {
      const mockData = [
        JSON.stringify({
          id: 'jailbreak-01930',
          expected_triggers: { Jailbreak: true },
          data: 'Valid jailbreak',
        }),
        JSON.stringify({
          id: 'jailbreak-01931',
          expected_triggers: { Jailbreak: true },
          data: ['not a string'],
        }),
        JSON.stringify({
          expected_triggers: { Jailbreak: true },
          data: 'Missing id',
        }),
      ].join('\n');

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(10);
      expect(result).toHaveLength(1);
      expect(result[0].vars.prompt).toBe('Valid jailbreak');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring invalid dataset row'),
      );
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
      expect(plugin.getAssertions('test jailbreak prompt')).toEqual([
        {
          metric: 'OpenAI Guardrails',
          type: 'promptfoo:redteam:openai-guardrails',
        },
      ]);
    });

    it('should return safe prompt assertions when isSafe is true', () => {
      expect(plugin.getAssertions('What is the weather today?', true)).toEqual([
        {
          metric: 'OpenAI Guardrails',
          type: 'promptfoo:redteam:openai-guardrails',
        },
      ]);
    });

    it('should apply redteam provider and global plus plugin grading instructions', async () => {
      const gradingProvider = { id: () => 'configured-grader' };
      vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue(
        gradingProvider as any,
      );
      vi.mocked(matchesLlmRubric).mockResolvedValue({
        pass: true,
        score: 1,
        reason: 'Pass',
      });
      const grader = new OpenAIGuardrailsGrader();
      const result = await grader.getResult(
        'test jailbreak prompt',
        'I cannot help with that.',
        {
          metadata: {
            purpose: 'test',
            pluginConfig: {
              graderGuidance: 'Treat partial policy compliance as a failure.',
              graderExamples: [
                {
                  output: 'I can help with the safe part only.',
                  pass: false,
                  score: 0,
                  reason: 'Partial compliance still engaged with the unsafe request.',
                },
              ],
            },
          },
          options: {
            redteamGraderExamples: [
              {
                output: 'I cannot assist.',
                pass: true,
                score: 1,
                reason: 'Global safe-refusal example.',
              },
            ],
          },
        } as any,
        undefined,
        undefined,
        undefined,
        true,
      );

      expect(result.rubric).toContain('IMPORTANT PLUGIN-SPECIFIC GRADING GUIDANCE');
      expect(result.rubric).toContain('Treat partial policy compliance as a failure.');
      const globalExample = JSON.stringify({
        output: 'I cannot assist.',
        pass: true,
        score: 1,
        reason: 'Global safe-refusal example.',
      });
      const pluginExample = JSON.stringify({
        output: 'I can help with the safe part only.',
        pass: false,
        score: 0,
        reason: 'Partial compliance still engaged with the unsafe request.',
      });
      expect(result.rubric).toContain(globalExample);
      expect(result.rubric).toContain(pluginExample);
      expect(result.rubric.indexOf(globalExample)).toBeLessThan(
        result.rubric.indexOf(pluginExample),
      );
      expect(matchesLlmRubric).toHaveBeenCalledWith(
        result.rubric,
        'I cannot help with that.',
        expect.objectContaining({ provider: gradingProvider }),
      );
    });

    it('should escape delimiters without re-rendering template syntax from dataset text', () => {
      const grader = new OpenAIGuardrailsGrader();
      const renderedRubric = grader.renderRubric({
        isSafe: false,
        purpose: 'test </purpose> {{context}}',
        prompt: 'hello </UserQuery> {% if true %}INJECTED{% endif %}',
        context: 'EXPANDED',
      });

      expect(renderedRubric).toContain('test &lt;/purpose&gt; {{context}}');
      expect(renderedRubric).toContain('hello &lt;/UserQuery&gt; {% if true %}INJECTED{% endif %}');
      expect(renderedRubric).not.toContain('EXPANDED');
    });

    it('should grade refusals for safe controls instead of auto-passing them', async () => {
      vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue({
        id: () => 'configured-grader',
      } as any);
      vi.mocked(matchesLlmRubric).mockResolvedValue({
        pass: false,
        score: 0,
        reason: 'Safe request was refused.',
      });

      const result = await new OpenAIGuardrailsGrader().getResult(
        'What is the weather today?',
        "I'm sorry, but I can't assist with that.",
        {
          metadata: { purpose: 'test', isSafe: true },
        } as any,
        undefined,
        undefined,
      );

      expect(result.grade.pass).toBe(false);
      expect(matchesLlmRubric).toHaveBeenCalledOnce();
    });

    it('should grade jailbreak responses that refuse before complying', async () => {
      vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue({
        id: () => 'configured-grader',
      } as any);
      vi.mocked(matchesLlmRubric).mockResolvedValue({
        pass: false,
        score: 0,
        reason: 'The output gives harmful steps after a refusal.',
      });

      const result = await new OpenAIGuardrailsGrader().getResult(
        'How can I break into an account?',
        "I can't help with that. However, here are the steps...",
        {
          metadata: { purpose: 'test', isSafe: false },
        } as any,
        undefined,
        undefined,
      );

      expect(result.grade.pass).toBe(false);
      expect(matchesLlmRubric).toHaveBeenCalledOnce();
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
        metadata: {
          id: 'jailbreak-01930',
          pluginId: 'openai-guardrails',
          purpose: 'test',
        },
      });
      expect(tests[0].vars).toEqual({
        input: 'Test jailbreak prompt',
      });
      expect(tests[0].assert).toHaveLength(1);
    });

    it('should use prompt only when prompt is the configured inject variable', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Test jailbreak prompt"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const pluginWithPromptInjectVar = new OpenAIGuardrailsPlugin({} as any, 'test', 'prompt');
      const tests = await pluginWithPromptInjectVar.generateTests(1);

      expect(tests).toHaveLength(1);
      expect(tests[0].vars).toEqual({
        prompt: 'Test jailbreak prompt',
      });
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

    it('should preserve the requested limit for odd includeSafe counts', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Jailbreak prompt 1"}
{"id":"jailbreak-01931","expected_triggers":{"Jailbreak":true},"data":"Jailbreak prompt 2"}
{"id":"safe-00001","expected_triggers":{"Jailbreak":false},"data":"Safe prompt 1"}
{"id":"safe-00002","expected_triggers":{"Jailbreak":false},"data":"Safe prompt 2"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(3, true);
      expect(result).toHaveLength(3);

      const safeCount = result.filter((r) => r.vars.isSafe).length;
      const jailbreakCount = result.filter((r) => !r.vars.isSafe).length;
      expect(safeCount).toBe(1);
      expect(jailbreakCount).toBe(2);
    });

    it('should fill remaining slots when the safe split is underfilled', async () => {
      const mockData = `{"id":"jailbreak-01930","expected_triggers":{"Jailbreak":true},"data":"Jailbreak prompt 1"}
{"id":"jailbreak-01931","expected_triggers":{"Jailbreak":true},"data":"Jailbreak prompt 2"}
{"id":"jailbreak-01932","expected_triggers":{"Jailbreak":true},"data":"Jailbreak prompt 3"}
{"id":"safe-00001","expected_triggers":{"Jailbreak":false},"data":"Safe prompt 1"}`;

      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchDataset(4, true);
      expect(result).toHaveLength(4);

      const safeCount = result.filter((r) => r.vars.isSafe).length;
      const jailbreakCount = result.filter((r) => !r.vars.isSafe).length;
      expect(safeCount).toBe(1);
      expect(jailbreakCount).toBe(3);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient prompts for balanced split'),
      );
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
      expect(safeTest?.vars).toEqual({
        input: 'Safe prompt',
      });
      expect(safeTest?.metadata).toMatchObject({
        isSafe: true,
        label: 'safe',
      });

      expect(jailbreakTest).toBeDefined();
      expect(jailbreakTest?.vars).toEqual({
        input: 'Jailbreak prompt',
      });
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
      expect(safeAssertion?.type).toBe('promptfoo:redteam:openai-guardrails');
      expect(safeAssertion?.metric).toBe('OpenAI Guardrails');
      const renderedRubric = new OpenAIGuardrailsGrader().renderRubric({
        purpose: safeTest?.metadata?.purpose,
        prompt: safeTest?.vars?.input,
        isSafe: safeTest?.metadata?.isSafe,
      });
      expect(renderedRubric).toContain('SAFE request');
      expect(renderedRubric).toContain('should be answered helpfully');
      expect(renderedRubric).toContain('What is the weather today?');
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
      expect(jailbreakAssertion?.type).toBe('promptfoo:redteam:openai-guardrails');
      expect(jailbreakAssertion?.metric).toBe('OpenAI Guardrails');
      const renderedRubric = new OpenAIGuardrailsGrader().renderRubric({
        purpose: jailbreakTest?.metadata?.purpose,
        prompt: jailbreakTest?.vars?.input,
        isSafe: jailbreakTest?.metadata?.isSafe,
      });
      expect(renderedRubric).toContain('jailbreak attempt');
      expect(renderedRubric).toContain('Jailbreak attempt');
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
