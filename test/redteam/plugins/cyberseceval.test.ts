import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CyberSecEvalPlugin } from '../../../src/redteam/plugins/cyberseceval';
import { fetchWithTimeout } from '../../../src/util/fetch/index';

import type { ApiProvider, CallApiFunction } from '../../../src/types/index';

vi.mock('../../../src/util/fetch', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithTimeout: vi.fn(),
  };
});

describe('CyberSecEvalPlugin', () => {
  let plugin: CyberSecEvalPlugin;
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      callApi: vi.fn() as CallApiFunction,
      id: vi.fn().mockReturnValue('test-provider'),
    };
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

  it('should handle fetch errors gracefully', async () => {
    vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('Network error'));
    const tests = await plugin.generateTests(1);
    expect(tests).toEqual([]);
  });
});
