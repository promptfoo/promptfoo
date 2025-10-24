describe('AwsBedrockConverseProvider', () => {
  let provider: any;
  let mockSend: jest.Mock;
  let mockGetPrompt: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    mockSend = jest.fn();
    mockGetPrompt = jest.fn();

    // Mock AWS SDK
    jest.doMock('@aws-sdk/client-bedrock-runtime', () => ({
      BedrockRuntime: jest.fn().mockImplementation(() => ({ send: mockSend })),
      ConverseCommand: jest.fn().mockImplementation((params) => params),
    }));

    // Mock Bedrock prompt integration
    jest.doMock('../../src/integrations/bedrockPrompt', () => ({
      getPrompt: mockGetPrompt,
      parseBedrockPromptUrl: jest.fn((url: string) => {
        const match = url.match(/^bedrock:\/\/([A-Z0-9]+)(?::(\d+|DRAFT))?$/);
        if (!match) throw new Error('Invalid URL');
        return {
          promptId: match[1],
          version: match[2],
          region: 'us-east-1',
        };
      }),
    }));

    const { AwsBedrockConverseProvider } = await import('../../src/providers/bedrock/converse');
    provider = new AwsBedrockConverseProvider('us.anthropic.claude-3-5-sonnet-20241022-v2:0', {
      config: { region: 'us-east-1' },
    });
  });

  describe('provider identification', () => {
    it('should have correct id format', () => {
      expect(provider.id()).toBe('bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0');
    });

    it('should have correct string representation', () => {
      expect(provider.toString()).toContain('Amazon Bedrock Converse Provider');
    });
  });

  describe('callApi with plain text', () => {
    it('should send plain text to Converse API', async () => {
      const mockResponse = {
        output: {
          message: {
            content: [{ text: 'Hello from Converse' }],
          },
        },
        usage: {
          inputTokens: 10,
          outputTokens: 20,
        },
      };

      mockSend.mockResolvedValue(mockResponse);

      const result = await provider.callApi('Hello world');

      expect(mockSend).toHaveBeenCalled();
      expect(result.output).toBe('Hello from Converse');
      expect(result.tokenUsage?.total).toBe(30);
    });

    it('should handle errors', async () => {
      mockSend.mockRejectedValue(new Error('API error'));

      const result = await provider.callApi('Test');

      expect(result.error).toContain('Bedrock Converse API error');
    });
  });

  describe('callApi with bedrock:// prompts', () => {
    it('should fetch and use bedrock prompt', async () => {
      mockGetPrompt.mockResolvedValue('Rendered prompt text');

      const mockResponse = {
        output: {
          message: {
            content: [{ text: 'Response' }],
          },
        },
        usage: {
          inputTokens: 10,
          outputTokens: 10,
        },
      };

      mockSend.mockResolvedValue(mockResponse);

      const result = await provider.callApi('bedrock://PROMPT123', {
        vars: { genre: 'rock' },
        prompt: { raw: 'bedrock://PROMPT123', label: 'test' },
      });

      expect(mockGetPrompt).toHaveBeenCalledWith('PROMPT123', undefined, undefined, {
        genre: 'rock',
      });
      expect(result.output).toBe('Response');
    });
  });
});
