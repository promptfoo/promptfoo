import { MemorySystem, CrescendoProvider } from '../../../../src/redteam/providers/crescendo';
import { redteamProviderManager } from '../../../../src/redteam/providers/shared';
import type { Message } from '../../../../src/redteam/providers/shared';

describe('MemorySystem', () => {
  let memorySystem: MemorySystem;

  beforeEach(() => {
    memorySystem = new MemorySystem();
  });

  it('should add and retrieve messages for a conversation', () => {
    const conversationId = 'test-convo';
    const message: Message = { role: 'user', content: 'test message' };

    memorySystem.addMessage(conversationId, message);
    const conversation = memorySystem.getConversation(conversationId);

    expect(conversation).toHaveLength(1);
    expect(conversation[0]).toEqual(message);
  });

  it('should return empty array for non-existent conversation', () => {
    const conversation = memorySystem.getConversation('non-existent');
    expect(conversation).toEqual([]);
  });

  it('should duplicate conversation excluding last turn', () => {
    const conversationId = 'test-convo';
    const messages: Message[] = [
      { role: 'system', content: 'system message' },
      { role: 'user', content: 'user message 1' },
      { role: 'assistant', content: 'assistant message 1' },
      { role: 'user', content: 'user message 2' },
      { role: 'assistant', content: 'assistant message 2' },
    ];

    messages.forEach((msg) => memorySystem.addMessage(conversationId, msg));

    const newConversationId = memorySystem.duplicateConversationExcludingLastTurn(conversationId);
    const newConversation = memorySystem.getConversation(newConversationId);

    expect(newConversation).toHaveLength(3);
    expect(newConversation).toEqual(messages.slice(0, 3));
  });
});

describe('CrescendoProvider', () => {
  let crescendoProvider: CrescendoProvider;
  const mockRedTeamProvider = {
    id: () => 'mock-redteam',
    callApi: jest.fn(),
    delay: 0,
  };
  const mockScoringProvider = {
    id: () => 'mock-scoring',
    callApi: jest.fn(),
    delay: 0,
  };
  const mockTargetProvider = {
    id: () => 'mock-target',
    callApi: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    crescendoProvider = new CrescendoProvider({
      injectVar: 'objective',
      maxRounds: 10,
      maxBacktracks: 10,
      redteamProvider: mockRedTeamProvider,
      stateful: true,
    });

    jest.spyOn(redteamProviderManager, 'getProvider').mockImplementation(async ({ jsonOnly }) => {
      return jsonOnly ? mockRedTeamProvider : mockScoringProvider;
    });
  });

  it('should initialize with default config values', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxRounds: 10,
      maxBacktracks: 10,
      redteamProvider: mockRedTeamProvider,
      stateful: true,
    });

    expect(provider.config.injectVar).toBe('objective');
    expect(provider.config.redteamProvider).toBe(mockRedTeamProvider);
    expect(provider.config.maxRounds).toBe(10);
    expect(provider.config.maxBacktracks).toBe(10);
    expect(provider.config.stateful).toBe(true);
  });

  it('should return correct provider id', () => {
    expect(crescendoProvider.id()).toBe('promptfoo:redteam:crescendo');
  });

  it('should handle API call with required context', async () => {
    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
    };

    mockRedTeamProvider.callApi.mockResolvedValueOnce({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValueOnce({
      output: 'target response',
    });

    mockScoringProvider.callApi.mockResolvedValueOnce({
      output: JSON.stringify({
        value: true,
        metadata: 100,
        rationale: 'test rationale',
      }),
    });

    const result = await crescendoProvider.callApi(prompt, context);

    expect(result).toBeDefined();
    expect(result.output).toBe('target response');
    expect(result.metadata).toBeDefined();
  });

  it('should handle provider errors', async () => {
    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
    };

    mockRedTeamProvider.callApi.mockRejectedValueOnce(new Error('Provider error'));

    const result = await crescendoProvider.callApi(prompt, context);
    expect(result.output).toBe('');
    expect(result.metadata?.crescendoRoundsCompleted).toBe(10);
    expect(result.metadata?.crescendoBacktrackCount).toBe(0);
    expect(result.metadata?.crescendoResult).toBe(false);
  });

  it('should respect maxRounds config', async () => {
    crescendoProvider = new CrescendoProvider({
      injectVar: 'objective',
      redteamProvider: mockRedTeamProvider,
      maxRounds: 2,
    });

    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'target response',
    });

    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: false,
        metadata: 50,
        rationale: 'test rationale',
      }),
    });

    const result = await crescendoProvider.callApi(prompt, context);
    expect(result.metadata?.crescendoRoundsCompleted).toBeLessThanOrEqual(2);
  });
});
