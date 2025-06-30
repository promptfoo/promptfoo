import { fetchHuggingFaceDataset } from '../../../src/integrations/huggingfaceDatasets';
import {
  ToxicChatPlugin,
  ToxicChatGrader,
  fetchDataset,
  PLUGIN_ID,
} from '../../../src/redteam/plugins/toxicChat';
import type { TestCase } from '../../../src/types';

jest.mock('../../../src/integrations/huggingfaceDatasets');

describe('ToxicChatPlugin', () => {
  let plugin: ToxicChatPlugin;

  beforeEach(() => {
    plugin = new ToxicChatPlugin({ id: 'test-provider' } as any, 'Test purpose', 'prompt');
  });

  it('should set canGenerateRemote to false', () => {
    expect(ToxicChatPlugin.canGenerateRemote).toBe(false);
  });

  it('should have correct plugin ID', () => {
    expect(plugin.id).toBe(PLUGIN_ID);
  });

  it('should return correct template', async () => {
    const template = await plugin.getTemplate();
    expect(template).toBe('prompt');
  });

  it('should generate correct assertions', () => {
    const assertions = plugin.getAssertions('test prompt');
    expect(assertions).toHaveLength(1);
    expect(assertions[0]).toEqual({
      type: PLUGIN_ID,
      metric: 'ToxicChat',
    });
  });

  it('should generate tests correctly', async () => {
    const mockData: TestCase[] = [
      { vars: { user_input: 'toxic prompt', toxicity: 1, jailbreaking: 0 } },
    ];
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockData);

    const tests = await plugin.generateTests(1);

    expect(tests).toHaveLength(1);
    expect(tests[0].vars).toEqual({ prompt: 'toxic prompt' });
    expect(tests[0].assert).toHaveLength(1);
    expect(tests[0].assert?.[0]?.type).toBe(PLUGIN_ID);
  });
});

describe('ToxicChatGrader', () => {
  let grader: ToxicChatGrader;

  beforeEach(() => {
    grader = new ToxicChatGrader();
  });

  it('should have the correct plugin ID', () => {
    expect(grader.id).toBe(PLUGIN_ID);
  });

  it('should have appropriate rubric', () => {
    expect(grader.rubric).toContain('evaluating an AI Agent');
    expect(grader.rubric).toContain('toxic prompts and resists jailbreaking attempts');
    expect(grader.rubric).toContain('ToxicChat dataset');
    expect(grader.rubric).toContain('FAIL (score = 0)');
    expect(grader.rubric).toContain('PASS (score = 1)');
    expect(grader.rubric).toContain('reason, pass, score');
  });
});

describe('fetchDataset', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should fetch and filter toxic prompts', async () => {
    const mock: TestCase[] = [
      { vars: { user_input: 'toxic prompt', toxicity: 1, jailbreaking: 0 } },
      { vars: { user_input: 'safe prompt', toxicity: 0, jailbreaking: 0 } },
      { vars: { user_input: 'jailbreak attempt', toxicity: 0, jailbreaking: 1 } },
      { vars: { user_input: 'both toxic and jailbreak', toxicity: 1, jailbreaking: 1 } },
    ];
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mock);

    const result = await fetchDataset(3);

    expect(result).toHaveLength(3);
    // Should only include toxic or jailbreaking prompts
    expect(result[0]?.vars?.prompt).toBe('toxic prompt');
    expect(result[1]?.vars?.prompt).toBe('jailbreak attempt');
    expect(result[2]?.vars?.prompt).toBe('both toxic and jailbreak');
  });

  it('should handle missing user_input field', async () => {
    const mock: TestCase[] = [
      { vars: { toxicity: 1, jailbreaking: 0 } }, // Missing user_input
      { vars: { user_input: 'valid prompt', toxicity: 1, jailbreaking: 0 } },
    ];
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mock);

    const result = await fetchDataset(2);

    expect(result).toHaveLength(1);
    expect(result[0]?.vars?.prompt).toBe('valid prompt');
  });

  it('should handle non-string user_input', async () => {
    const mock: TestCase[] = [
      { vars: { user_input: 123, toxicity: 1, jailbreaking: 0 } }, // Non-string
      { vars: { user_input: 'valid prompt', toxicity: 1, jailbreaking: 0 } },
    ];
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mock);

    const result = await fetchDataset(2);

    expect(result).toHaveLength(1);
    expect(result[0]?.vars?.prompt).toBe('valid prompt');
  });

  it('should filter out safe prompts', async () => {
    const mock: TestCase[] = [
      { vars: { user_input: 'safe prompt 1', toxicity: 0, jailbreaking: 0 } },
      { vars: { user_input: 'safe prompt 2', toxicity: 0, jailbreaking: 0 } },
      { vars: { user_input: 'toxic prompt', toxicity: 1, jailbreaking: 0 } },
    ];
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mock);

    const result = await fetchDataset(5);

    expect(result).toHaveLength(1);
    expect(result[0]?.vars?.prompt).toBe('toxic prompt');
  });

  it('should handle missing vars', async () => {
    const mock: TestCase[] = [
      { vars: undefined }, // Missing vars
      { vars: { user_input: 'valid prompt', toxicity: 1, jailbreaking: 0 } },
    ];
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mock);

    const result = await fetchDataset(2);

    expect(result).toHaveLength(1);
    expect(result[0]?.vars?.prompt).toBe('valid prompt');
  });

  it('should respect the limit parameter', async () => {
    const mock: TestCase[] = Array(10)
      .fill(null)
      .map((_, i) => ({
        vars: { user_input: `prompt ${i}`, toxicity: 1, jailbreaking: 0 },
      }));
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mock);

    const result = await fetchDataset(3);

    expect(result).toHaveLength(3);
  });

  it('should handle fetch errors gracefully', async () => {
    jest.mocked(fetchHuggingFaceDataset).mockRejectedValue(new Error('Network error'));

    const result = await fetchDataset(3);

    expect(result).toEqual([]);
  });

  it('should call fetchHuggingFaceDataset with correct parameters', async () => {
    const mock: TestCase[] = [{ vars: { user_input: 'test', toxicity: 1, jailbreaking: 0 } }];
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mock);

    await fetchDataset(5);

    expect(fetchHuggingFaceDataset).toHaveBeenCalledWith(
      'huggingface://datasets/lmsys/toxic-chat?config=toxicchat0124&split=train',
      25, // 5 * 5 for filtering
    );
  });
});
