import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CyberSecEvalPlugin } from '../../../src/redteam/plugins/cyberseceval';
import { fetchWithTimeout } from '../../../src/util/fetch/index';
import { createMockProvider, type MockApiProvider } from '../../factories/provider';
import { sampleEachShufflePath } from '../../util/utils';

vi.mock('../../../src/util/fetch/index', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithTimeout: vi.fn(),
  };
});

describe('CyberSecEvalPlugin', () => {
  let plugin: CyberSecEvalPlugin;
  let mockProvider: MockApiProvider;

  beforeEach(() => {
    mockProvider = createMockProvider();
    plugin = new CyberSecEvalPlugin(mockProvider, 'test-purpose', 'testVar');

    // Mock successful response
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          test_case_prompt: 'System prompt',
          user_input: 'User input',
          judge_question: 'Did the AI do X?',
        },
      ]),
    } as unknown as Response);
  });

  it('should have the correct plugin ID', () => {
    expect(plugin.id).toBe('promptfoo:redteam:cyberseceval');
  });

  it('should set canGenerateRemote to false', () => {
    expect(CyberSecEvalPlugin.canGenerateRemote).toBe(false);
  });

  it('should throw error for getTemplate', async () => {
    await expect(plugin.getTemplate()).rejects.toThrow('Not implemented');
  });

  it('should return correct assertions', () => {
    const prompt = 'test prompt';
    const assertions = plugin.getAssertions(prompt);
    expect(assertions).toHaveLength(1);
    expect(assertions[0]).toMatchObject({
      metric: 'CyberSecEval',
      type: 'llm-rubric',
    });
  });

  it('should generate tests correctly', async () => {
    const tests = await plugin.generateTests(1);
    expect(tests).toHaveLength(1);
    expect(tests[0].vars).toBeDefined();
    expect(tests[0].assert).toBeDefined();

    // Add null checks to fix TypeScript errors
    const assertions = tests[0].assert || [];
    expect(assertions.length).toBeGreaterThan(0);
    expect(assertions[0].type).toBe('llm-rubric');
    expect(assertions[0].metric).toBe('CyberSecEval');
  });

  it('samples every ordered pair of rows equally', async () => {
    const rows = ['a', 'b', 'c'].map((userInput) => ({
      test_case_prompt: 'System prompt',
      user_input: userInput,
      judge_question: 'Did the AI do X?',
    }));
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rows),
    } as unknown as Response);

    const samples = await sampleEachShufflePath(async () =>
      (await plugin.generateTests(2))
        .map((test) => JSON.parse(String(test.vars?.testVar))[1].content)
        .join(''),
    );

    expect(samples).toEqual(['ab', 'ac', 'ba', 'bc', 'ca', 'cb']);
  });

  it('should handle fetch errors gracefully', async () => {
    vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('Network error'));
    const tests = await plugin.generateTests(1);
    expect(tests).toEqual([]);
  });
});
