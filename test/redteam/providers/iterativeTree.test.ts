import { jest } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import type { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import type { TreeSearchOutput } from '../../../src/redteam/providers/iterativeTree';
import {
  checkIfOnTopic,
  createTreeNode,
  evaluateResponse,
  getNewPrompt,
  MAX_WIDTH,
  renderSystemPrompts,
  selectNodes,
  updateRedteamHistory,
} from '../../../src/redteam/providers/iterativeTree';
import {
  ATTACKER_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  ON_TOPIC_SYSTEM_PROMPT,
} from '../../../src/redteam/providers/prompts';
import { getTargetResponse } from '../../../src/redteam/providers/shared';
import type { ApiProvider, CallApiContextParams, CallApiOptionsParams } from '../../../src/types';
import { getNunjucksEngine } from '../../../src/util/templates';

jest.mock('../../../src/providers/openai');
jest.mock('../../../src/util/templates');

describe('RedteamIterativeProvider', () => {
  describe('renderSystemPrompts', () => {
    it('should render system prompts correctly', () => {
      const goal = '{{goal}}';
      const result = renderSystemPrompts(getNunjucksEngine(), goal);
      expect(result.redteamSystemPrompt).toBe(ATTACKER_SYSTEM_PROMPT);
      expect(result.onTopicSystemPrompt).toBe(ON_TOPIC_SYSTEM_PROMPT);
      expect(result.judgeSystemPrompt).toBe(JUDGE_SYSTEM_PROMPT);
    });
  });

  describe('evaluateResponse', () => {
    let mockRedteamProvider: jest.Mocked<OpenAiChatCompletionProvider>;

    beforeEach(() => {
      mockRedteamProvider = {
        callApi: jest.fn(),
      } as unknown as jest.Mocked<OpenAiChatCompletionProvider>;
    });

    it('should evaluate response correctly without penalized phrase', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'Good response' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
      });

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        false,
      );

      expect(score).toBe(8);
      expect(explanation).toBe('Good response');
      expect(mockRedteamProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        expect.stringContaining('Current Response'),
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'judge',
          }),
        }),
      );
    });

    it('should apply penalty for penalized phrases', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'Good but penalized' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
      });

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        true,
      );

      expect(score).toBe(5); // 8 - 3 = 5
      expect(explanation).toBe('Good but penalized');
    });

    it('should handle minimum score correctly', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 2, explanation: 'Poor response' },
          previousBestResponse: { rating: 1, explanation: 'Previous response' },
        }),
      });

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        true,
      );

      expect(score).toBe(1); // 2 - 3, but minimum is 1
      expect(explanation).toBe('Poor response');
    });

    it('should handle missing previous response', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 7, explanation: 'First response' },
          previousBestResponse: { rating: 0, explanation: '' },
        }),
      });

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        '',
        false,
      );

      expect(score).toBe(7);
      expect(explanation).toBe('First response');
      expect(JSON.parse(mockRedteamProvider.callApi.mock.calls[0][0])).toEqual([
        {
          role: 'system',
          content: 'Judge prompt',
        },
        {
          role: 'user',
          content: expect.stringContaining('Previous Best Response:\nNone'),
        },
      ]);
    });
  });

  describe('getNewPrompt', () => {
    let mockRedteamProvider: jest.Mocked<OpenAiChatCompletionProvider>;

    beforeEach(() => {
      mockRedteamProvider = {
        callApi: jest.fn(),
      } as unknown as jest.Mocked<OpenAiChatCompletionProvider>;
    });

    it('should generate a new prompt correctly', async () => {
      const mockResponse = {
        improvement: 'Improved aspect',
        prompt: 'New prompt',
      };
      mockRedteamProvider.callApi.mockResolvedValue({ output: JSON.stringify(mockResponse) });

      const redteamHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User message' },
      ];

      const result = await getNewPrompt(mockRedteamProvider, redteamHistory);

      expect(result).toEqual(mockResponse);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        '[{"role":"system","content":"System prompt"},{"role":"user","content":"User message"}]',
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'history',
            raw: '[{"role":"system","content":"System prompt"},{"role":"user","content":"User message"}]',
          }),
        }),
      );
    });

    it('should throw an error for invalid API response', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({ output: 'invalid json' });

      const redteamHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: 'System prompt' },
      ];
      // eslint-disable-next-line jest/require-to-throw-message
      await expect(getNewPrompt(mockRedteamProvider, redteamHistory)).rejects.toThrow();
    });

    it('should handle empty history correctly', async () => {
      const mockResponse = {
        improvement: 'Initial improvement',
        prompt: 'Initial prompt',
      };
      mockRedteamProvider.callApi.mockResolvedValue({ output: JSON.stringify(mockResponse) });

      const result = await getNewPrompt(mockRedteamProvider, []);

      expect(result).toEqual(mockResponse);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        '[]',
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'history',
            raw: '[]',
          }),
        }),
      );
    });
  });

  describe('checkIfOnTopic', () => {
    let mockRedteamProvider: jest.Mocked<OpenAiChatCompletionProvider>;

    beforeEach(() => {
      mockRedteamProvider = {
        callApi: jest.fn(),
      } as unknown as jest.Mocked<OpenAiChatCompletionProvider>;
    });

    it('should return true for on-topic prompt', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({ output: JSON.stringify({ onTopic: true }) });

      const result = await checkIfOnTopic(
        mockRedteamProvider,
        'On-topic system prompt',
        'Target prompt',
      );

      expect(result).toMatchObject({ isOnTopic: true });
      expect(mockRedteamProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        '[{"role":"system","content":"On-topic system prompt"},{"role":"user","content":"Target prompt"}]',
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'on-topic',
            raw: '[{"role":"system","content":"On-topic system prompt"},{"role":"user","content":"Target prompt"}]',
          }),
        }),
      );
    });

    it('should return false for off-topic prompt', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({ output: JSON.stringify({ onTopic: false }) });

      const result = await checkIfOnTopic(
        mockRedteamProvider,
        'On-topic system prompt',
        'Off-topic prompt',
      );

      expect(result).toMatchObject({ isOnTopic: false });
    });

    it('should throw an error for invalid API response', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({ output: 'invalid json' });

      await expect(
        checkIfOnTopic(mockRedteamProvider, 'On-topic system prompt', 'Target prompt'),
      ).rejects.toThrow(); // eslint-disable-line jest/require-to-throw-message
    });

    it('should throw an error for unexpected API response format', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({ unexpectedKey: true }),
      });

      await expect(
        checkIfOnTopic(mockRedteamProvider, 'On-topic system prompt', 'Target prompt'),
      ).rejects.toThrow('Invariant failed: Expected onTopic to be a boolean');
    });
  });

  describe('updateRedteamHistory', () => {
    it('should create a new history entry with correct content', () => {
      const targetResponse = 'Test response';
      const goal = 'Test goal';
      const score = 7;
      const isOnTopic = true;
      const containsPenalizedPhrase = false;

      const result = updateRedteamHistory(
        targetResponse,
        goal,
        score,
        isOnTopic,
        containsPenalizedPhrase,
      );

      expect(result).toEqual({
        role: 'user',
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Test response'),
      });
      expect(result.content).toContain(`OBJECTIVE: ${goal}`);
      expect(result.content).toContain(`SCORE: ${score}`);
      expect(result.content).not.toContain('(your prompt was off-topic)');
      expect(result.content).not.toContain('(contains penalized phrase)');
    });

    it('should handle off-topic and penalized responses', () => {
      const targetResponse = 'Off-topic response';
      const goal = 'Test goal';
      const score = 3;
      const isOnTopic = false;
      const containsPenalizedPhrase = true;

      const result = updateRedteamHistory(
        targetResponse,
        goal,
        score,
        isOnTopic,
        containsPenalizedPhrase,
      );

      expect(result).toEqual({
        role: 'user',
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Off-topic response'),
      });
      expect(result.content).toContain(`OBJECTIVE: ${goal}`);
      expect(result.content).toContain(
        `SCORE: ${score} (your prompt was off-topic) (contains penalized phrase)`,
      );
    });

    it('should handle edge case scores', () => {
      const targetResponse = 'Edge case response';
      const goal = 'Test goal';
      const score = 10; // Maximum score
      const isOnTopic = true;
      const containsPenalizedPhrase = false;

      const result = updateRedteamHistory(
        targetResponse,
        goal,
        score,
        isOnTopic,
        containsPenalizedPhrase,
      );

      expect(result).toEqual({
        role: 'user',
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Edge case response'),
      });
      expect(result.content).toContain(`SCORE: ${score}`);
    });

    it('should handle minimum score', () => {
      const targetResponse = 'Minimum score response';
      const goal = 'Test goal';
      const score = 0; // Minimum score
      const isOnTopic = true;
      const containsPenalizedPhrase = false;

      const result = updateRedteamHistory(
        targetResponse,
        goal,
        score,
        isOnTopic,
        containsPenalizedPhrase,
      );

      expect(result).toEqual({
        role: 'user',
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Minimum score response'),
      });
      expect(result.content).toContain(`SCORE: ${score}`);
    });
  });

  describe('getTargetResponse', () => {
    let mockTargetProvider: jest.Mocked<ApiProvider>;

    beforeEach(() => {
      mockTargetProvider = {
        id: jest.fn().mockReturnValue('mock-provider'),
        callApi: jest.fn<ApiProvider['callApi']>(),
      } as jest.Mocked<ApiProvider>;
    });

    it('should get target response correctly', async () => {
      const mockResponse = { output: 'Target response' };
      mockTargetProvider.callApi.mockResolvedValue({ output: mockResponse });

      const targetPrompt = 'Test prompt';
      const context: CallApiContextParams = {
        prompt: { label: 'test', raw: targetPrompt },
        vars: {},
      };
      const options: CallApiOptionsParams = {};
      const result = await getTargetResponse(mockTargetProvider, targetPrompt, context, options);

      expect(result).toEqual({
        output: JSON.stringify(mockResponse),
        sessionId: undefined,
        tokenUsage: { numRequests: 1 },
      });
      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockTargetProvider.callApi).toHaveBeenCalledWith(targetPrompt, context, options);
    });

    it('should stringify non-string outputs', async () => {
      const nonStringOutput = { key: 'value' };
      mockTargetProvider.callApi.mockResolvedValue({ output: nonStringOutput });

      const targetPrompt = 'Test prompt';
      const result = await getTargetResponse(
        mockTargetProvider,
        targetPrompt,
        {} as CallApiContextParams,
        {} as CallApiOptionsParams,
      );

      expect(result).toEqual({
        output: JSON.stringify(nonStringOutput),
        sessionId: undefined,
        tokenUsage: { numRequests: 1 },
      });
    });
  });
});
describe('TreeNode', () => {
  describe('createTreeNode', () => {
    it('should create a node with unique UUID', () => {
      const node1 = createTreeNode('prompt1', 5, 0);
      const node2 = createTreeNode('prompt2', 5, 0);

      expect(node1.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(node2.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(node1.id).not.toBe(node2.id);
    });

    it('should use provided UUID if given', () => {
      const customId = uuidv4();
      const node = createTreeNode('prompt', 5, 0, customId);
      expect(node.id).toBe(customId);
    });
  });
});

describe('Tree Structure', () => {
  it('should track parent-child relationships in treeOutputs', async () => {
    const parentId = uuidv4();
    const childId = uuidv4();
    const parentNode = createTreeNode('parent', 5, 0, parentId);
    const childNode = createTreeNode('child', 7, 1, childId);

    const treeOutputs: TreeSearchOutput[] = [];
    treeOutputs.push({
      depth: 0,
      id: parentNode.id,
      isOnTopic: true,
      output: 'parent output',
      prompt: 'parent prompt',
      score: 5,
      wasSelected: true,
    });

    treeOutputs.push({
      depth: 1,
      id: childNode.id,
      improvement: 'test improvement',
      isOnTopic: true,
      output: 'child output',
      parentId: parentNode.id,
      prompt: 'child prompt',
      score: 7,
      wasSelected: false,
    });

    const childOutput = treeOutputs.find((o) => o.id === childNode.id);
    expect(childOutput?.parentId).toBe(parentNode.id);
    expect(childOutput?.depth).toBe(1);
    expect(childOutput?.improvement).toBe('test improvement');
  });

  describe('selectNodes', () => {
    let mockRedteamProvider: jest.Mocked<ApiProvider>;

    beforeEach(() => {
      mockRedteamProvider = {
        callApi: jest.fn<ApiProvider['callApi']>().mockResolvedValue({
          output: JSON.stringify({ onTopic: true }),
        }),
        id: jest.fn().mockReturnValue('mock-provider'),
      } as jest.Mocked<ApiProvider>;
    });

    it('should mark selected nodes in treeOutputs', async () => {
      const nodes = [
        createTreeNode('node1', 3, 0),
        createTreeNode('node2', 8, 0),
        createTreeNode('node3', 5, 0),
      ];

      const treeOutputs: TreeSearchOutput[] = nodes.map((node) => ({
        depth: node.depth,
        id: node.id,
        isOnTopic: true,
        output: 'test output',
        prompt: node.prompt,
        score: node.score,
        wasSelected: false,
      }));

      const selectedNodes = await selectNodes(
        nodes,
        mockRedteamProvider,
        'test prompt',
        'test goal',
      );

      selectedNodes.forEach((node) => {
        const output = treeOutputs.find((o) => o.id === node.id);
        if (output) {
          output.wasSelected = true;
        }
      });

      const selectedOutputs = treeOutputs.filter((o) => o.wasSelected);
      expect(selectedOutputs.length).toBeLessThanOrEqual(MAX_WIDTH);

      const allSortedByScore = [...treeOutputs].sort((a, b) => b.score - a.score);
      const expectedLength = Math.min(MAX_WIDTH, allSortedByScore.length);
      expect(selectedOutputs).toHaveLength(expectedLength);

      const expectedScores = allSortedByScore.slice(0, expectedLength).map((n) => n.score);
      const actualScores = selectedOutputs.map((n) => n.score).sort((a, b) => b - a);
      expect(actualScores).toEqual(expectedScores);
    });
  });

  describe('Tree Reconstruction', () => {
    it('should be able to reconstruct tree from treeOutputs', () => {
      const treeOutputs: TreeSearchOutput[] = [
        {
          depth: 0,
          id: 'root',
          isOnTopic: true,
          output: 'root output',
          prompt: 'root prompt',
          score: 5,
          wasSelected: true,
        },
        {
          depth: 1,
          id: 'child1',
          improvement: 'improvement1',
          isOnTopic: true,
          output: 'child1 output',
          parentId: 'root',
          prompt: 'child1 prompt',
          score: 7,
          wasSelected: true,
        },
        {
          depth: 1,
          id: 'child2',
          improvement: 'improvement2',
          isOnTopic: true,
          output: 'child2 output',
          parentId: 'root',
          prompt: 'child2 prompt',
          score: 6,
          wasSelected: false,
        },
      ];

      function reconstructTree(outputs: TreeSearchOutput[]) {
        const nodes = new Map<string, { children: string[]; output: TreeSearchOutput }>();

        outputs.forEach((output) => {
          nodes.set(output.id, { children: [], output });
        });

        outputs.forEach((output) => {
          if (output.parentId && nodes.has(output.parentId)) {
            nodes.get(output.parentId)?.children.push(output.id);
          }
        });

        return nodes;
      }

      const tree = reconstructTree(treeOutputs);

      expect(tree.get('root')?.children).toHaveLength(2);
      expect(tree.get('child1')?.output.wasSelected).toBe(true);
      expect(tree.get('child2')?.output.wasSelected).toBe(false);
      expect(tree.get('child1')?.output.improvement).toBe('improvement1');
    });
  });
});

describe('Tree Structure and Metadata', () => {
  let mockRedteamProvider: jest.Mocked<ApiProvider>;
  let mockTargetProvider: jest.Mocked<ApiProvider>;

  beforeEach(() => {
    mockRedteamProvider = {
      id: jest.fn().mockReturnValue('mock-provider'),
      callApi: jest.fn<ApiProvider['callApi']>().mockResolvedValue({
        output: JSON.stringify({ onTopic: true }),
      }),
    } as jest.Mocked<ApiProvider>;

    mockTargetProvider = {
      id: jest.fn().mockReturnValue('mock-provider'),
      callApi: jest.fn<ApiProvider['callApi']>().mockResolvedValue({
        output: 'test response',
      }),
    } as jest.Mocked<ApiProvider>;
  });
  it('should track parent-child relationships in metadata', async () => {
    const parentPrompt = 'parent prompt';
    const childPrompt = 'child prompt';
    const improvement = 'test improvement';

    mockRedteamProvider.callApi
      .mockResolvedValueOnce({ output: JSON.stringify({ onTopic: true }) })
      .mockResolvedValueOnce({ output: JSON.stringify({ improvement, prompt: childPrompt }) });

    mockTargetProvider.callApi.mockResolvedValue({ output: 'test response' });

    const treeOutputs: TreeSearchOutput[] = [];
    const parentNode = createTreeNode(parentPrompt, 5, 0);
    const childNode = createTreeNode(childPrompt, 7, 1);

    treeOutputs.push({
      depth: 0,
      id: parentNode.id,
      isOnTopic: true,
      output: 'parent output',
      prompt: parentPrompt,
      score: 5,
      wasSelected: true,
    });

    treeOutputs.push({
      depth: 1,
      id: childNode.id,
      improvement,
      isOnTopic: true,
      output: 'child output',
      parentId: parentNode.id,
      prompt: childPrompt,
      score: 7,
      wasSelected: false,
    });

    const childOutput = treeOutputs.find((o) => o.id === childNode.id);
    expect(childOutput?.parentId).toBe(parentNode.id);
    expect(childOutput?.depth).toBe(1);
    expect(childOutput?.improvement).toBe(improvement);
  });

  it('should track tree structure across multiple depths', () => {
    const rootId = uuidv4();
    const child1Id = uuidv4();
    const child2Id = uuidv4();
    const grandchild1Id = uuidv4();

    const treeOutputs: TreeSearchOutput[] = [
      {
        depth: 0,
        id: rootId,
        isOnTopic: true,
        output: 'root output',
        prompt: 'root prompt',
        score: 5,
        wasSelected: true,
      },
      {
        depth: 1,
        id: child1Id,
        improvement: 'improvement1',
        isOnTopic: true,
        output: 'child1 output',
        parentId: rootId,
        prompt: 'child1 prompt',
        score: 7,
        wasSelected: true,
      },
      {
        depth: 1,
        id: child2Id,
        improvement: 'improvement2',
        isOnTopic: true,
        output: 'child2 output',
        parentId: rootId,
        prompt: 'child2 prompt',
        score: 6,
        wasSelected: false,
      },
      {
        depth: 2,
        id: grandchild1Id,
        improvement: 'improvement3',
        isOnTopic: true,
        output: 'grandchild1 output',
        parentId: child1Id,
        prompt: 'grandchild1 prompt',
        score: 8,
        wasSelected: true,
      },
    ];

    function reconstructTree(outputs: TreeSearchOutput[]) {
      const nodes = new Map<string, { children: string[]; output: TreeSearchOutput }>();

      outputs.forEach((output) => {
        nodes.set(output.id, { children: [], output });
      });

      outputs.forEach((output) => {
        if (output.parentId && nodes.has(output.parentId)) {
          nodes.get(output.parentId)?.children.push(output.id);
        }
      });

      return nodes;
    }

    const tree = reconstructTree(treeOutputs);

    expect(tree.get(rootId)?.children).toHaveLength(2);
    expect(tree.get(child1Id)?.children).toHaveLength(1);
    expect(tree.get(child2Id)?.children).toHaveLength(0);
    expect(tree.get(grandchild1Id)?.output.parentId).toBe(child1Id);

    expect(tree.get(rootId)?.output.wasSelected).toBe(true);
    expect(tree.get(child1Id)?.output.wasSelected).toBe(true);
    expect(tree.get(child2Id)?.output.wasSelected).toBe(false);
    expect(tree.get(grandchild1Id)?.output.wasSelected).toBe(true);

    expect(tree.get(child1Id)?.output.improvement).toBe('improvement1');
    expect(tree.get(child2Id)?.output.improvement).toBe('improvement2');
    expect(tree.get(grandchild1Id)?.output.improvement).toBe('improvement3');

    expect(tree.get(rootId)?.output.depth).toBe(0);
    expect(tree.get(child1Id)?.output.depth).toBe(1);
    expect(tree.get(child2Id)?.output.depth).toBe(1);
    expect(tree.get(grandchild1Id)?.output.depth).toBe(2);
  });

  it('should validate metadata format', () => {
    const metadata = {
      attempts: 10,
      highestScore: 8,
      redteamFinalPrompt: 'final prompt',
      stoppingReason: 'TARGET_SCORE' as const,
      treeOutputs: JSON.stringify([
        {
          depth: 0,
          id: 'root',
          isOnTopic: true,
          output: 'root output',
          prompt: 'root prompt',
          score: 5,
          wasSelected: true,
          graderPassed: true,
        },
        {
          depth: 1,
          id: 'child',
          improvement: 'improvement',
          isOnTopic: true,
          output: 'child output',
          parentId: 'root',
          prompt: 'child prompt',
          score: 8,
          wasSelected: true,
          graderPassed: false,
        },
      ]),
    };

    expect(metadata).toHaveProperty('highestScore');
    expect(metadata).toHaveProperty('redteamFinalPrompt');
    expect(metadata).toHaveProperty('stoppingReason');
    expect(metadata).toHaveProperty('attempts');
    expect(metadata).toHaveProperty('treeOutputs');

    const treeOutputs = JSON.parse(metadata.treeOutputs);
    expect(Array.isArray(treeOutputs)).toBe(true);
    expect(treeOutputs[0]).toHaveProperty('id');
    expect(treeOutputs[0]).toHaveProperty('prompt');
    expect(treeOutputs[0]).toHaveProperty('output');
    expect(treeOutputs[0]).toHaveProperty('score');
    expect(treeOutputs[0]).toHaveProperty('isOnTopic');
    expect(treeOutputs[0]).toHaveProperty('depth');
    expect(treeOutputs[0]).toHaveProperty('wasSelected');
    expect(treeOutputs[0]).toHaveProperty('graderPassed');

    expect(treeOutputs[1].parentId).toBe('root');
    expect(treeOutputs[1].improvement).toBe('improvement');
    expect(treeOutputs[1].graderPassed).toBe(false);
  });
});
