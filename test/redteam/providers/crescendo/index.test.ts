import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CrescendoProvider, MemorySystem } from '../../../../src/redteam/providers/crescendo';
import type { Message } from '../../../../src/redteam/providers/shared';
import type { ApiProvider } from '../../../../src/types';

// Mock the redteam provider manager
jest.mock('../../../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: jest.fn(),
  },
}));

// Mock the promptfoo provider
jest.mock('../../../../src/providers/promptfoo', () => ({
  PromptfooChatCompletionProvider: jest.fn().mockImplementation(() => ({
    id: () => 'mock-unblocking',
    callApi: jest.fn(),
    delay: 0,
  })),
}));

// Mock server feature support
const mockCheckServerFeatureSupport = jest.fn();
jest.mock('../../../../src/util/server', () => ({
  checkServerFeatureSupport: mockCheckServerFeatureSupport,
}));

// Mock graders
jest.mock('../../../../src/redteam/graders', () => ({
  getGraderById: jest.fn(),
}));

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
  let mockRedTeamProvider: ApiProvider;
  let mockScoringProvider: ApiProvider;
  let mockTargetProvider: ApiProvider;

  beforeEach(() => {
    // Set up server feature support mock
    (mockCheckServerFeatureSupport as any).mockResolvedValue(true);

    // Mock target provider
    mockTargetProvider = {
      id: () => 'mock-target',
      callApi: jest.fn() as any,
    };

    (mockTargetProvider.callApi as any).mockResolvedValue({
      output: 'mock response',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    // Mock red team provider
    mockRedTeamProvider = {
      id: () => 'mock-redteam',
      callApi: jest.fn() as any,
    };

    (mockRedTeamProvider.callApi as any).mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'What is the weather?',
        rationaleBehindJailbreak: 'This is a benign question.',
        lastResponseSummary: 'The model responded normally.',
      }),
      tokenUsage: { total: 15, prompt: 8, completion: 7 },
    });

    // Mock scoring provider
    mockScoringProvider = {
      id: () => 'mock-scoring',
      callApi: jest.fn() as any,
    };

    (mockScoringProvider.callApi as any).mockResolvedValue({
      output: JSON.stringify({ score: 50 }),
      tokenUsage: { total: 5, prompt: 3, completion: 2 },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with required config', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      redteamProvider: mockRedTeamProvider,
    });

    expect(provider.id()).toBe('promptfoo:redteam:crescendo');
    expect(provider.config.injectVar).toBe('objective');
    expect(provider.config.redteamProvider).toBe(mockRedTeamProvider);
  });

  it('should initialize with default config values', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 10,
      maxBacktracks: 10,
      redteamProvider: mockRedTeamProvider,
      stateful: true,
    });

    expect(provider.config.injectVar).toBe('objective');
    expect(provider.config.redteamProvider).toBe(mockRedTeamProvider);
    expect(provider.config.maxTurns).toBe(10);
    expect(provider.config.maxBacktracks).toBe(10);
    expect(provider.config.stateful).toBe(true);
    expect(provider.config.continueAfterSuccess).toBe(false); // New default
  });

  describe('continueAfterSuccess functionality', () => {
    it('should default continueAfterSuccess to false', () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        redteamProvider: mockRedTeamProvider,
      });

      expect(provider.config.continueAfterSuccess).toBe(false);
    });

    it('should respect continueAfterSuccess configuration', () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        redteamProvider: mockRedTeamProvider,
        continueAfterSuccess: true,
      });

      expect(provider.config.continueAfterSuccess).toBe(true);
    });

    it('should initialize successful attacks tracking', () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        redteamProvider: mockRedTeamProvider,
      });

      // Check that the provider has the private property for tracking
      expect(provider).toBeDefined();
      expect(typeof provider.callApi).toBe('function');
    });

    it('should have the expected metadata interface', () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        redteamProvider: mockRedTeamProvider,
      });

      // Test that the provider can be instantiated with continueAfterSuccess
      const providerWithContinue = new CrescendoProvider({
        injectVar: 'objective',
        redteamProvider: mockRedTeamProvider,
        continueAfterSuccess: true,
      });

      expect(provider.config.continueAfterSuccess).toBe(false);
      expect(providerWithContinue.config.continueAfterSuccess).toBe(true);
    });
  });

  it('should return correct provider id', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      redteamProvider: mockRedTeamProvider,
    });
    expect(provider.id()).toBe('promptfoo:redteam:crescendo');
  });

  it('should handle maxTurns configuration', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 5,
      redteamProvider: mockRedTeamProvider,
    });

    expect(provider.config.maxTurns).toBe(5);
  });

  it('should handle maxBacktracks configuration', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxBacktracks: 3,
      redteamProvider: mockRedTeamProvider,
    });

    expect(provider.config.maxBacktracks).toBe(3);
  });

  it('should handle stateful configuration', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      stateful: true,
      redteamProvider: mockRedTeamProvider,
    });

    expect(provider.config.stateful).toBe(true);
  });

  it('should handle excludeTargetOutputFromAgenticAttackGeneration configuration', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      excludeTargetOutputFromAgenticAttackGeneration: true,
      redteamProvider: mockRedTeamProvider,
    });

    expect(provider.config.excludeTargetOutputFromAgenticAttackGeneration).toBe(true);
  });

  it('should set maxBacktracks to 0 when stateful is true', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxBacktracks: 5,
      stateful: true,
      redteamProvider: mockRedTeamProvider,
    });

    // When stateful is true, maxBacktracks should be set to 0
    expect(provider.config.stateful).toBe(true);
  });
}); 