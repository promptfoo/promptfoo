import { AwsBedrockKnowledgeBaseProvider } from '../../../src/providers/bedrock/knowledgeBase';

const mockSend = jest.fn();
const mockBedrockClient = {
  send: mockSend,
};

jest.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: jest.fn().mockImplementation(() => mockBedrockClient),
  RetrieveAndGenerateCommand: jest.fn().mockImplementation((params) => params),
}));

const { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } = jest.requireMock(
  '@aws-sdk/client-bedrock-agent-runtime',
);

jest.mock('@smithy/node-http-handler', () => {
  return {
    NodeHttpHandler: jest.fn(),
  };
});

jest.mock('proxy-agent', () => jest.fn());

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockIsCacheEnabled = jest.fn().mockReturnValue(false);

jest.mock('../../../src/cache', () => ({
  getCache: jest.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
  })),
  isCacheEnabled: () => mockIsCacheEnabled(),
}));

describe('AwsBedrockKnowledgeBaseProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AWS_BEDROCK_MAX_RETRIES;
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.npm_config_https_proxy;
    delete process.env.npm_config_http_proxy;
    delete process.env.npm_config_proxy;
    delete process.env.all_proxy;
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.npm_config_https_proxy;
    delete process.env.npm_config_http_proxy;
    delete process.env.npm_config_proxy;
    delete process.env.all_proxy;
  });

  it('should throw an error if knowledgeBaseId is not provided', () => {
    expect(() => {
      new AwsBedrockKnowledgeBaseProvider('us.anthropic.claude-3-7-sonnet-20241022-v2:0', {
        config: {} as any,
      });
    }).toThrow('Knowledge Base ID is required');
  });

  it('should create provider with required options', () => {
    const provider = new AwsBedrockKnowledgeBaseProvider(
      'us.anthropic.claude-3-7-sonnet-20241022-v2:0',
      {
        config: {
          knowledgeBaseId: 'kb-123',
          region: 'us-east-1',
        },
      },
    );

    expect(provider).toBeDefined();
    expect(provider.kbConfig.knowledgeBaseId).toBe('kb-123');
    expect(provider.getRegion()).toBe('us-east-1');
  });

  it('should create knowledge base client without proxy settings', async () => {
    const provider = new AwsBedrockKnowledgeBaseProvider(
      'us.anthropic.claude-3-7-sonnet-20241022-v2:0',
      {
        config: {
          knowledgeBaseId: 'kb-123',
          region: 'us-east-1',
        },
      },
    );

    await provider.getKnowledgeBaseClient();

    expect(BedrockAgentRuntimeClient).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 10,
    });
  });

  it('should create knowledge base client with credentials', async () => {
    const provider = new AwsBedrockKnowledgeBaseProvider(
      'us.anthropic.claude-3-7-sonnet-20241022-v2:0',
      {
        config: {
          knowledgeBaseId: 'kb-123',
          region: 'us-east-1',
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        },
      },
    );

    await provider.getKnowledgeBaseClient();

    expect(BedrockAgentRuntimeClient).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 10,
      credentials: {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      },
    });
  });

  it('should respect AWS_BEDROCK_MAX_RETRIES environment variable', async () => {
    process.env.AWS_BEDROCK_MAX_RETRIES = '5';
    const provider = new AwsBedrockKnowledgeBaseProvider(
      'us.anthropic.claude-3-7-sonnet-20241022-v2:0',
      {
        config: {
          knowledgeBaseId: 'kb-123',
          region: 'us-east-1',
        },
      },
    );

    await provider.getKnowledgeBaseClient();

    expect(BedrockAgentRuntimeClient).toHaveBeenCalledWith({
      region: 'us-east-1',
      retryMode: 'adaptive',
      maxAttempts: 5,
    });
  });

  it('should call the knowledge base API with correct parameters', async () => {
    const mockResponse = {
      output: {
        text: 'This is the response from the knowledge base',
      },
      citations: [
        {
          retrievedReferences: [
            {
              content: {
                text: 'This is a citation',
              },
              location: {
                type: 's3',
                s3Location: {
                  uri: 's3://bucket/key',
                },
              },
            },
          ],
          generatedResponsePart: {
            textResponsePart: {
              text: 'part of the response',
              span: {
                start: 0,
                end: 10,
              },
            },
          },
        },
      ],
    };

    mockSend.mockResolvedValueOnce(mockResponse);

    const provider = new AwsBedrockKnowledgeBaseProvider(
      'us.anthropic.claude-3-7-sonnet-20241022-v2:0',
      {
        config: {
          knowledgeBaseId: 'kb-123',
          region: 'us-east-1',
        },
      },
    );

    const result = await provider.callApi('What is the capital of France?');

    const expectedCommand = {
      input: { text: 'What is the capital of France?' },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: 'kb-123',
          modelArn: 'us.anthropic.claude-3-7-sonnet-20241022-v2:0',
        },
      },
    };

    expect(RetrieveAndGenerateCommand).toHaveBeenCalledWith(expectedCommand);
    expect(mockSend).toHaveBeenCalledWith(expectedCommand);
    expect(result).toEqual({
      output: 'This is the response from the knowledge base',
      metadata: { citations: mockResponse.citations },
      tokenUsage: {},
    });
  });

  it('should handle API errors gracefully', async () => {
    mockSend.mockRejectedValueOnce(new Error('API error'));

    const provider = new AwsBedrockKnowledgeBaseProvider(
      'us.anthropic.claude-3-7-sonnet-20241022-v2:0',
      {
        config: {
          knowledgeBaseId: 'kb-123',
          region: 'us-east-1',
        },
      },
    );

    const result = await provider.callApi('What is the capital of France?');

    expect(result).toEqual({
      error: 'Bedrock Knowledge Base API error: Error: API error',
    });
  });

  it('should use custom modelArn if provided', async () => {
    const mockResponse = {
      output: {
        text: 'This is the response from the knowledge base',
      },
      citations: [],
    };

    mockSend.mockResolvedValueOnce(mockResponse);

    const provider = new AwsBedrockKnowledgeBaseProvider('amazon.nova-lite-v1:0', {
      config: {
        knowledgeBaseId: 'kb-123',
        region: 'us-east-1',
        modelArn: 'custom:model:arn',
      },
    });

    await provider.callApi('What is the capital of France?');

    const expectedCommand = {
      input: { text: 'What is the capital of France?' },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: 'kb-123',
          modelArn: 'custom:model:arn',
        },
      },
    };

    expect(RetrieveAndGenerateCommand).toHaveBeenCalledWith(expectedCommand);
  });

  it('should pass along config parameters but not create generationConfiguration', async () => {
    const mockResponse = {
      output: {
        text: 'This is the response from the knowledge base',
      },
      citations: [],
    };

    mockSend.mockResolvedValueOnce(mockResponse);

    const provider = new AwsBedrockKnowledgeBaseProvider('amazon.nova-lite-v1:0', {
      config: {
        knowledgeBaseId: 'kb-123',
        region: 'us-east-1',
      } as any,
    });

    await provider.callApi('What is the capital of France?');

    const expectedCommand = {
      input: { text: 'What is the capital of France?' },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: 'kb-123',
          modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0',
        },
      },
    };

    expect(RetrieveAndGenerateCommand).toHaveBeenCalledWith(expectedCommand);
  });

  it('should retrieve citations from cache when available', async () => {
    mockIsCacheEnabled.mockReturnValue(true);

    const cachedResponse = JSON.stringify({
      output: 'Cached response from knowledge base',
      citations: [
        {
          retrievedReferences: [
            {
              content: { text: 'Citation from cache' },
              location: { s3Location: { uri: 'https://example.com/cached' } },
            },
          ],
        },
      ],
    });

    mockGet.mockResolvedValueOnce(cachedResponse);

    const provider = new AwsBedrockKnowledgeBaseProvider(
      'us.anthropic.claude-3-7-sonnet-20241022-v2:0',
      {
        config: {
          knowledgeBaseId: 'kb-123',
          region: 'us-east-1',
        },
      },
    );

    const result = await provider.callApi('What is the capital of France?');

    expect(mockGet).toHaveBeenCalledWith(
      expect.stringMatching(/^bedrock-kb:.*:What is the capital of France\?$/),
    );

    expect(result).toEqual({
      output: 'Cached response from knowledge base',
      metadata: {
        citations: [
          {
            retrievedReferences: [
              {
                content: { text: 'Citation from cache' },
                location: { s3Location: { uri: 'https://example.com/cached' } },
              },
            ],
          },
        ],
      },
      tokenUsage: {},
      cached: true,
    });

    mockIsCacheEnabled.mockReturnValue(false);
  });

  it('should use custom modelArn in cache key when provided', async () => {
    mockIsCacheEnabled.mockReturnValue(true);

    const provider = new AwsBedrockKnowledgeBaseProvider('amazon.nova-lite-v1:0', {
      config: {
        knowledgeBaseId: 'kb-123',
        region: 'us-east-1',
        modelArn: 'custom:model:arn',
      },
    });

    mockGet.mockResolvedValueOnce(null);

    const mockResponse = {
      output: {
        text: 'Response with custom model ARN',
      },
      citations: [],
    };
    mockSend.mockResolvedValueOnce(mockResponse);

    await provider.callApi('What is the capital of France?');

    expect(mockGet).toHaveBeenCalledWith(
      expect.stringMatching(/^bedrock-kb:.*:What is the capital of France\?$/),
    );

    expect(mockSet).toHaveBeenCalledWith(
      expect.stringMatching(/^bedrock-kb:.*:What is the capital of France\?$/),
      expect.any(String),
    );

    mockIsCacheEnabled.mockReturnValue(false);
  });
});
