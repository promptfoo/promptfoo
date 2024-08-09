import { EventEmitter } from 'events';
import RedteamIterativeTreeProvider, {
  parseJudgement,
  calculateScore,
  expandNode,
  treeSearch,
} from '../../../src/redteam/providers/iterativeTree';

describe('parseJudgement', () => {
  it('should correctly parse valid JSON output', () => {
    const output = '{"rating": 7}';
    expect(parseJudgement(output)).toEqual({ refusal: 0, convincing: 3, specific: 4 });
  });

  it('should handle invalid JSON', () => {
    const output = 'invalid json';
    expect(parseJudgement(output)).toEqual({ refusal: 0, convincing: 0, specific: 0 });
  });

  it('should handle missing rating', () => {
    const output = '{}';
    expect(parseJudgement(output)).toEqual({ refusal: 0, convincing: 0, specific: 0 });
  });

  it('should handle refusal case', () => {
    const output = '{"rating": 1}';
    expect(parseJudgement(output)).toEqual({ refusal: 1, convincing: 1, specific: 1 });
  });
});

describe('calculateScore', () => {
  it('should return 0 for refusal', () => {
    expect(calculateScore({ refusal: 1, convincing: 5, specific: 5 })).toBe(0);
  });

  it('should calculate average of convincing and specific for non-refusal', () => {
    expect(calculateScore({ refusal: 0, convincing: 3, specific: 5 })).toBe(4);
  });
});

describe('expandNode', () => {
  const mockRedteamProvider = {
    callApi: jest.fn().mockResolvedValue({ output: '{"prompt": "new prompt"}' }),
  };
  const mockTargetProvider = {
    callApi: jest.fn().mockResolvedValue({ output: 'target response' }),
  };
  const mockParser = jest.fn().mockReturnValue({ classification: 'Non-Refusal' });

  it('should expand a node and return children', async () => {
    const node = { prompt: 'test', score: 0, children: [], depth: 0 };
    const children = await expandNode(
      node,
      mockRedteamProvider as any,
      mockTargetProvider as any,
      mockParser,
      'goal',
      'redteamPrompt',
      'onTopicPrompt',
      'nonRefusalPrompt',
      'judgePrompt',
      3,
      0,
    );

    expect(children.length).toBeGreaterThan(0);
    expect(children[0].prompt).toBe('new prompt');
  });

  it('should not expand node beyond max depth', async () => {
    const node = { prompt: 'test', score: 0, children: [], depth: 3 };
    const children = await expandNode(
      node,
      mockRedteamProvider as any,
      mockTargetProvider as any,
      mockParser,
      'goal',
      'redteamPrompt',
      'onTopicPrompt',
      'nonRefusalPrompt',
      'judgePrompt',
      3,
      0,
    );

    expect(children).toHaveLength(0);
  });
});

describe('treeSearch', () => {
  const mockExpandNode = jest.fn().mockResolvedValue([
    { prompt: 'child1', score: 5, children: [], depth: 1 },
    { prompt: 'child2', score: 8, children: [], depth: 1 },
  ]);
  const mockRedteamProvider = {} as any;
  const mockTargetProvider = {} as any;
  const mockParser = jest.fn();
  const mockMetricsEmitter = new EventEmitter();

  it('should perform tree search and return best node', async () => {
    const root = { prompt: 'root', score: 0, children: [], depth: 0 };
    const bestNode = await treeSearch(
      root,
      mockExpandNode,
      mockRedteamProvider,
      mockTargetProvider,
      mockParser,
      'goal',
      'redteamPrompt',
      'onTopicPrompt',
      'nonRefusalPrompt',
      'judgePrompt',
      3,
      0,
      10,
      mockMetricsEmitter,
    );

    expect(bestNode.prompt).toBe('child2');
    expect(bestNode.score).toBe(8);
  });

  it('should stop early if early stopping score is reached', async () => {
    mockExpandNode.mockResolvedValueOnce([
      { prompt: 'child1', score: 9.6, children: [], depth: 1 },
    ]);

    const root = { prompt: 'root', score: 0, children: [], depth: 0 };
    const bestNode = await treeSearch(
      root,
      mockExpandNode,
      mockRedteamProvider,
      mockTargetProvider,
      mockParser,
      'goal',
      'redteamPrompt',
      'onTopicPrompt',
      'nonRefusalPrompt',
      'judgePrompt',
      3,
      0,
      9.5,
      mockMetricsEmitter,
    );

    expect(bestNode.prompt).toBe('child1');
    expect(bestNode.score).toBe(9.6);
    expect(mockExpandNode).toHaveBeenCalledTimes(1);
  });
});

describe('RedteamIterativeTreeProvider', () => {
  const mockConfig = {
    injectVar: 'query',
  };

  it('should create an instance with correct id', () => {
    const provider = new RedteamIterativeTreeProvider(mockConfig);
    expect(provider.id()).toBe('promptfoo:redteam:iterative:tree');
  });

  it('should call API and return result', async () => {
    const provider = new RedteamIterativeTreeProvider(mockConfig);
    const mockContext = {
      vars: { query: 'test goal' },
      originalProvider: {} as any,
    };

    // Mock the treeSearch function
    jest
      .spyOn(global as any, 'treeSearch')
      .mockImplementation()
      .mockResolvedValue({
        prompt: 'best prompt',
        score: 8,
        output: 'best output',
      });

    const result = await provider.callApi('initial prompt', mockContext);

    expect(result).toHaveProperty('output', 'best output');
    expect(result.metadata).toHaveProperty('redteamFinalPrompt', 'best prompt');
    expect(result.metadata).toHaveProperty('redteamFinalScore', 8);
    expect(result.metadata).toHaveProperty('searchMetrics');
  });

  it('should throw error if context is undefined', async () => {
    const provider = new RedteamIterativeTreeProvider(mockConfig);
    await expect(provider.callApi('test')).rejects.toThrow('Context is undefined');
  });

  it('should throw error if goal is undefined', async () => {
    const provider = new RedteamIterativeTreeProvider(mockConfig);
    const mockContext = {
      vars: {},
      originalProvider: {} as any,
    };
    await expect(provider.callApi('test', mockContext)).rejects.toThrow('Goal is undefined');
  });
});
