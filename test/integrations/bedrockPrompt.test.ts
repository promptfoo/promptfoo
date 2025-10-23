jest.mock('../../src/envars');
jest.mock('@aws-sdk/client-bedrock-agent');
jest.mock('../../src/util/templates');

describe('bedrock prompt integration', () => {
  let mockBedrockAgentClient: any;
  let mockSend: jest.Mock;
  let mockRenderString: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock process.env for AWS credentials
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.AWS_SESSION_TOKEN = undefined;
    process.env.AWS_REGION = 'us-east-1';

    // Mock getEnvString before importing modules
    jest.doMock('../../src/envars', () => ({
      getEnvString: jest.fn((key: string) => {
        switch (key) {
          case 'AWS_BEDROCK_REGION':
            return 'us-west-2';
          default:
            return '';
        }
      }),
    }));

    // Mock Nunjucks engine
    mockRenderString = jest.fn((template: string, vars: any) => {
      // Simple mock implementation that substitutes {{var}} with actual values
      return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
    });

    jest.doMock('../../src/util/templates', () => ({
      getNunjucksEngine: jest.fn(() => ({
        renderString: mockRenderString,
      })),
    }));

    // Create mock for Bedrock Agent Client
    mockSend = jest.fn();
    mockBedrockAgentClient = {
      send: mockSend,
    };

    jest.doMock('@aws-sdk/client-bedrock-agent', () => ({
      BedrockAgentClient: jest.fn().mockImplementation(() => mockBedrockAgentClient),
      GetPromptCommand: jest.fn().mockImplementation((params) => params),
    }));
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
    // Clean up process.env
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;
    delete process.env.AWS_REGION;
  });

  describe('parseBedrockPromptUrl', () => {
    it('should parse prompt ID without version', async () => {
      const { parseBedrockPromptUrl } = await import('../../src/integrations/bedrockPrompt');
      const result = parseBedrockPromptUrl('bedrock://PROMPT12345');

      expect(result).toEqual({
        promptId: 'PROMPT12345',
        version: undefined,
        region: 'us-west-2', // From AWS_BEDROCK_REGION env var
      });
    });

    it('should parse prompt ID with numeric version', async () => {
      const { parseBedrockPromptUrl } = await import('../../src/integrations/bedrockPrompt');
      const result = parseBedrockPromptUrl('bedrock://PROMPT12345:2');

      expect(result).toEqual({
        promptId: 'PROMPT12345',
        version: '2',
        region: 'us-west-2',
      });
    });

    it('should parse prompt ID with DRAFT version', async () => {
      const { parseBedrockPromptUrl } = await import('../../src/integrations/bedrockPrompt');
      const result = parseBedrockPromptUrl('bedrock://PROMPT12345:DRAFT');

      expect(result).toEqual({
        promptId: 'PROMPT12345',
        version: 'DRAFT',
        region: 'us-west-2',
      });
    });

    it('should handle alphanumeric prompt IDs', async () => {
      const { parseBedrockPromptUrl } = await import('../../src/integrations/bedrockPrompt');
      const result = parseBedrockPromptUrl('bedrock://ABC123XYZ');

      expect(result).toEqual({
        promptId: 'ABC123XYZ',
        version: undefined,
        region: 'us-west-2',
      });
    });

    it('should reject invalid URL format', async () => {
      const { parseBedrockPromptUrl } = await import('../../src/integrations/bedrockPrompt');

      expect(() => parseBedrockPromptUrl('bedrock://invalid-with-dashes')).toThrow(
        'Invalid Bedrock prompt URL format',
      );
      expect(() => parseBedrockPromptUrl('bedrock://prompt:invalid-version')).toThrow(
        'Invalid Bedrock prompt URL format',
      );
      expect(() => parseBedrockPromptUrl('not-a-bedrock-url')).toThrow(
        'Invalid Bedrock prompt URL format',
      );
    });
  });

  describe('getPrompt', () => {
    it('should fetch a TEXT prompt without version (DRAFT)', async () => {
      const mockResponse = {
        variants: [
          {
            templateType: 'TEXT',
            templateConfiguration: {
              text: {
                text: 'Make me a {{genre}} playlist with {{number}} songs.',
              },
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');
      const result = await getPrompt('PROMPT12345');

      expect(mockSend).toHaveBeenCalledWith({
        promptIdentifier: 'PROMPT12345',
        promptVersion: undefined,
      });
      expect(result).toBe('Make me a {{genre}} playlist with {{number}} songs.');
    });

    it('should fetch a TEXT prompt with specific version', async () => {
      const mockResponse = {
        variants: [
          {
            templateType: 'TEXT',
            templateConfiguration: {
              text: {
                text: 'Version 2: {{prompt}}',
              },
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');
      const result = await getPrompt('PROMPT12345', '2');

      expect(mockSend).toHaveBeenCalledWith({
        promptIdentifier: 'PROMPT12345',
        promptVersion: '2',
      });
      expect(result).toBe('Version 2: {{prompt}}');
    });

    it('should fetch a CHAT prompt and return JSON', async () => {
      const mockMessages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Tell me about {{topic}}' },
      ];
      const mockResponse = {
        variants: [
          {
            templateType: 'CHAT',
            templateConfiguration: {
              chat: {
                messages: mockMessages,
              },
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');
      const result = await getPrompt('CHATPROMPT123', '1');

      expect(result).toBe(JSON.stringify(mockMessages));
    });

    it('should use custom region parameter', async () => {
      const mockResponse = {
        variants: [
          {
            templateType: 'TEXT',
            templateConfiguration: {
              text: {
                text: 'Test prompt',
              },
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');
      await getPrompt('PROMPT12345', undefined, 'eu-west-1');

      // Client should be created with eu-west-1 region
      const { BedrockAgentClient } = await import('@aws-sdk/client-bedrock-agent');
      expect(BedrockAgentClient).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'eu-west-1' }),
      );
    });

    it('should handle prompt with no variants', async () => {
      const mockResponse = {
        variants: [],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');

      await expect(getPrompt('PROMPT12345')).rejects.toThrow('has no variants');
    });

    it('should handle variant with no template configuration', async () => {
      const mockResponse = {
        variants: [
          {
            templateType: 'TEXT',
            templateConfiguration: null,
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');

      await expect(getPrompt('PROMPT12345')).rejects.toThrow('has no template configuration');
    });

    it('should handle TEXT variant with no text', async () => {
      const mockResponse = {
        variants: [
          {
            templateType: 'TEXT',
            templateConfiguration: {
              text: null,
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');

      await expect(getPrompt('PROMPT12345')).rejects.toThrow('has no text template');
    });

    it('should handle CHAT variant with no messages', async () => {
      const mockResponse = {
        variants: [
          {
            templateType: 'CHAT',
            templateConfiguration: {
              chat: null,
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');

      await expect(getPrompt('PROMPT12345')).rejects.toThrow('has no messages');
    });

    it('should handle unsupported template type', async () => {
      const mockResponse = {
        variants: [
          {
            templateType: 'UNKNOWN',
            templateConfiguration: {},
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');

      await expect(getPrompt('PROMPT12345')).rejects.toThrow(
        'Unsupported Bedrock prompt template type: UNKNOWN',
      );
    });

    it('should handle ResourceNotFoundException error', async () => {
      const error = new Error('ResourceNotFoundException: Prompt not found');
      error.name = 'ResourceNotFoundException';
      mockSend.mockRejectedValue(error);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');

      await expect(getPrompt('NONEXISTENT')).rejects.toThrow(
        'Bedrock prompt "NONEXISTENT" not found in region us-west-2',
      );
    });

    it('should handle ResourceNotFoundException error with version', async () => {
      const error = new Error('ResourceNotFoundException: Prompt version not found');
      error.name = 'ResourceNotFoundException';
      mockSend.mockRejectedValue(error);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');

      await expect(getPrompt('PROMPT12345', '999')).rejects.toThrow(
        'Bedrock prompt "PROMPT12345" version 999 not found in region us-west-2',
      );
    });

    it('should handle AccessDeniedException error', async () => {
      const error = new Error('AccessDeniedException: User is not authorized');
      error.name = 'AccessDeniedException';
      mockSend.mockRejectedValue(error);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');

      await expect(getPrompt('PROMPT12345')).rejects.toThrow(
        'Access denied to Bedrock prompt "PROMPT12345". Ensure your AWS credentials have bedrock:GetPrompt permission',
      );
    });

    it('should handle generic AWS errors', async () => {
      const error = new Error('ThrottlingException: Rate exceeded');
      mockSend.mockRejectedValue(error);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');

      await expect(getPrompt('PROMPT12345', '1')).rejects.toThrow(
        'Failed to fetch Bedrock prompt "PROMPT12345" version 1: ThrottlingException: Rate exceeded',
      );
    });

    it('should use AWS_BEDROCK_REGION env var over AWS_REGION', async () => {
      const mockResponse = {
        variants: [
          {
            templateType: 'TEXT',
            templateConfiguration: {
              text: { text: 'Test' },
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');
      await getPrompt('PROMPT12345');

      const { BedrockAgentClient } = await import('@aws-sdk/client-bedrock-agent');
      // Should use us-west-2 from AWS_BEDROCK_REGION, not us-east-1 from AWS_REGION
      expect(BedrockAgentClient).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'us-west-2' }),
      );
    });

    it('should use credentials from env vars when available', async () => {
      const mockResponse = {
        variants: [
          {
            templateType: 'TEXT',
            templateConfiguration: {
              text: { text: 'Test' },
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');
      const result = await getPrompt('PROMPT12345');

      // Verify the prompt was fetched successfully (credentials worked)
      expect(result).toBe('Test');
      expect(mockSend).toHaveBeenCalledWith({
        promptIdentifier: 'PROMPT12345',
        promptVersion: undefined,
      });
    });

    it('should substitute variables in TEXT prompts', async () => {
      const mockResponse = {
        variants: [
          {
            templateType: 'TEXT',
            templateConfiguration: {
              text: {
                text: 'Create a {{genre}} playlist with {{number}} songs.',
              },
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');
      const result = await getPrompt('PROMPT12345', undefined, undefined, {
        genre: 'rock',
        number: '5',
      });

      expect(result).toBe('Create a rock playlist with 5 songs.');
      expect(mockRenderString).toHaveBeenCalledWith(
        'Create a {{genre}} playlist with {{number}} songs.',
        { genre: 'rock', number: '5' },
      );
    });

    it('should return unrendered TEXT prompt when no vars provided', async () => {
      const mockResponse = {
        variants: [
          {
            templateType: 'TEXT',
            templateConfiguration: {
              text: {
                text: 'Create a {{genre}} playlist with {{number}} songs.',
              },
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');
      const result = await getPrompt('PROMPT12345');

      expect(result).toBe('Create a {{genre}} playlist with {{number}} songs.');
      expect(mockRenderString).not.toHaveBeenCalled();
    });

    it('should substitute variables in CHAT prompts', async () => {
      const mockMessages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Tell me about {{topic}}' },
      ];
      const mockResponse = {
        variants: [
          {
            templateType: 'CHAT',
            templateConfiguration: {
              chat: {
                messages: mockMessages,
              },
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');
      const result = await getPrompt('CHATPROMPT123', '1', undefined, { topic: 'AI' });

      const renderedMessages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Tell me about AI' },
      ];
      expect(result).toBe(JSON.stringify(renderedMessages));
      expect(mockRenderString).toHaveBeenCalledWith('You are a helpful assistant.', {
        topic: 'AI',
      });
      expect(mockRenderString).toHaveBeenCalledWith('Tell me about {{topic}}', { topic: 'AI' });
    });

    it('should return unrendered CHAT prompt when no vars provided', async () => {
      const mockMessages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Tell me about {{topic}}' },
      ];
      const mockResponse = {
        variants: [
          {
            templateType: 'CHAT',
            templateConfiguration: {
              chat: {
                messages: mockMessages,
              },
            },
          },
        ],
      };
      mockSend.mockResolvedValue(mockResponse);

      const { getPrompt } = await import('../../src/integrations/bedrockPrompt');
      const result = await getPrompt('CHATPROMPT123', '1');

      expect(result).toBe(JSON.stringify(mockMessages));
      expect(mockRenderString).not.toHaveBeenCalled();
    });
  });
});
