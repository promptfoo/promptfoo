import type { RetrieveCommand, RetrieveCommandOutput } from '@aws-sdk/client-bedrock-agent-runtime';
import { jest } from '@jest/globals';
import { BedrockKnowledgeBaseProvider } from '../../src/providers/bedrock';
import type { CallApiContextParams, CallApiOptionsParams, Prompt } from '../../src/types';

// Create mock response
const mockResponse: RetrieveCommandOutput = {
  $metadata: {},
  retrievalResults: [
    {
      content: {
        text: 'Test response',
      },
    },
  ],
};

// Create typed mock send function
const mockSend = jest.fn<(command: RetrieveCommand) => Promise<RetrieveCommandOutput>>();

// Mock the BedrockAgentRuntimeClient module
jest.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: jest.fn(() => ({
    send: mockSend,
  })),
  RetrieveCommand: jest.fn(),
}));

describe('BedrockKnowledgeBaseProvider', () => {
  const knowledgeBaseId = 'test-kb-123';
  const testPrompt = 'test prompt';

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue(mockResponse);
  });

  it('generates correct provider id', () => {
    const provider = new BedrockKnowledgeBaseProvider(knowledgeBaseId);
    expect(provider.id()).toBe(`bedrock:knowledge-base:${knowledgeBaseId}`);
  });

  it('initializes with correct configuration', () => {
    const config = {
      region: 'us-west-2',
      vectorSearchConfiguration: {
        numberOfResults: 5,
      },
    };
    const provider = new BedrockKnowledgeBaseProvider(knowledgeBaseId, { config });
    expect(provider.config).toEqual(config);
  });

  it('generates and returns session id', () => {
    const provider = new BedrockKnowledgeBaseProvider(knowledgeBaseId);
    const sessionId = provider.getSessionId();
    expect(sessionId).toMatch(/^bedrock-kb-\d+$/);
  });

  it('calls AWS Bedrock Knowledge Base API correctly', async () => {
    const provider = new BedrockKnowledgeBaseProvider(knowledgeBaseId);
    const prompt: Prompt = {
      raw: testPrompt,
      label: 'test-prompt',
    };
    const context: CallApiContextParams = {
      vars: {},
      prompt,
    };
    const options: CallApiOptionsParams = {};

    const response = await provider.callApi(testPrompt, context, options);

    expect(response.output).toBe('Test response');
    expect(response.error).toBeUndefined();
    expect(response.sessionId).toMatch(/^bedrock-kb-\d+$/);
  });

  it('handles empty response from Knowledge Base', async () => {
    const emptyResponse: RetrieveCommandOutput = {
      $metadata: {},
      retrievalResults: [],
    };
    mockSend.mockResolvedValueOnce(emptyResponse);

    const provider = new BedrockKnowledgeBaseProvider(knowledgeBaseId);
    const response = await provider.callApi(testPrompt);

    expect(response.output).toBe('');
    expect(response.error).toBeUndefined();
  });

  it('handles API errors gracefully', async () => {
    const errorMessage = 'API Error';
    mockSend.mockRejectedValueOnce(new Error(errorMessage));

    const provider = new BedrockKnowledgeBaseProvider(knowledgeBaseId);
    const response = await provider.callApi(testPrompt);

    expect(response.error).toBe(`Knowledge Base API call error: Error: ${errorMessage}`);
    expect(response.output).toBeUndefined();
  });
});
