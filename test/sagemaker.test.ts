import { SageMakerCompletionProvider, SageMakerEmbeddingProvider } from '../src/providers/sagemaker';
import { loadApiProvider } from '../src/providers';

// Mock the AWS SDK client
jest.mock('@aws-sdk/client-sagemaker-runtime', () => {
  const mockSend = jest.fn().mockImplementation(async (command) => {
    if (command.EndpointName === 'fail-endpoint') {
      throw new Error('SageMaker endpoint failed');
    }
    
    // For embedding endpoints
    if (command.EndpointName.includes('embedding')) {
      return {
        Body: {
          transformToString: () => JSON.stringify({
            embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
          })
        }
      };
    }
    
    // Different response formats based on endpoint name
    let responseBody;
    
    if (command.EndpointName.includes('openai')) {
      responseBody = {
        choices: [
          {
            message: {
              content: 'This is a response from OpenAI-compatible endpoint'
            }
          }
        ]
      };
    } else if (command.EndpointName.includes('anthropic')) {
      responseBody = {
        content: [
          {
            text: 'This is a response from Claude-compatible endpoint'
          }
        ]
      };
    } else if (command.EndpointName.includes('llama')) {
      responseBody = {
        generation: 'This is a response from Llama-compatible endpoint'
      };
    } else if (command.EndpointName.includes('huggingface')) {
      responseBody = [
        {
          generated_text: 'This is a response from HuggingFace-compatible endpoint'
        }
      ];
    } else {
      // Custom format
      responseBody = {
        output: 'This is a response from custom endpoint'
      };
    }
    
    return {
      Body: {
        transformToString: () => JSON.stringify(responseBody)
      }
    };
  });

  return {
    SageMakerRuntimeClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    InvokeEndpointCommand: jest.fn().mockImplementation((params) => params)
  };
});

describe('SageMakerCompletionProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with correct endpoint name', () => {
    const provider = new SageMakerCompletionProvider('test-endpoint', {});
    expect(provider.endpointName).toBe('test-endpoint');
    expect(provider.id()).toBe('sagemaker:test-endpoint');
  });
  
  it('should initialize with correct region from config', () => {
    const provider = new SageMakerCompletionProvider('test-endpoint', {
      config: {
        region: 'us-west-2'
      }
    });
    expect(provider.getRegion()).toBe('us-west-2');
  });
  
  it('should initialize with correct region from environment', () => {
    process.env.AWS_REGION = 'us-east-2';
    const provider = new SageMakerCompletionProvider('test-endpoint', {});
    expect(provider.getRegion()).toBe('us-east-2');
    delete process.env.AWS_REGION;
  });
  
  it('should use credential options from config', async () => {
    const provider = new SageMakerCompletionProvider('test-endpoint', {
      config: {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        sessionToken: 'test-token'
      }
    });
    
    const credentials = await provider.getCredentials();
    expect(credentials).toEqual({
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      sessionToken: 'test-token'
    });
  });
  
  it('should handle errors from SageMaker endpoint', async () => {
    const provider = new SageMakerCompletionProvider('fail-endpoint', {});
    const result = await provider.callApi('test prompt');
    
    expect(result.error).toBeDefined();
    expect(result.error).toContain('SageMaker API error');
  });
  
  it('should call SageMaker endpoint with proper request for OpenAI format', async () => {
    const provider = new SageMakerCompletionProvider('openai-endpoint', {
      config: {
        modelType: 'openai'
      }
    });
    
    const result = await provider.callApi('test prompt');
    
    expect(result.output).toBe('This is a response from OpenAI-compatible endpoint');
    expect(result.tokenUsage).toBeDefined();
  });
  
  it('should call SageMaker endpoint with proper request for Anthropic format', async () => {
    const provider = new SageMakerCompletionProvider('anthropic-endpoint', {
      config: {
        modelType: 'anthropic'
      }
    });
    
    const result = await provider.callApi('test prompt');
    
    expect(result.output).toBe('This is a response from Claude-compatible endpoint');
  });
  
  it('should call SageMaker endpoint with proper request for Llama format', async () => {
    const provider = new SageMakerCompletionProvider('llama-endpoint', {
      config: {
        modelType: 'llama'
      }
    });
    
    const result = await provider.callApi('test prompt');
    
    expect(result.output).toBe('This is a response from Llama-compatible endpoint');
  });
  
  it('should call SageMaker endpoint with proper request for HuggingFace format', async () => {
    const provider = new SageMakerCompletionProvider('huggingface-endpoint', {
      config: {
        modelType: 'huggingface'
      }
    });
    
    const result = await provider.callApi('test prompt');
    
    expect(result.output).toBe('This is a response from HuggingFace-compatible endpoint');
  });
  
  it('should call SageMaker endpoint with proper request for custom format', async () => {
    const provider = new SageMakerCompletionProvider('custom-endpoint', {
      config: {
        modelType: 'custom'
      }
    });
    
    const result = await provider.callApi('test prompt');
    
    expect(result.output).toBe('This is a response from custom endpoint');
  });
  
  it('should handle JSON formatted prompts', async () => {
    const provider = new SageMakerCompletionProvider('openai-endpoint', {
      config: {
        modelType: 'openai'
      }
    });
    
    const jsonPrompt = JSON.stringify([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello!' }
    ]);
    
    const result = await provider.callApi(jsonPrompt);
    
    expect(result.output).toBe('This is a response from OpenAI-compatible endpoint');
  });
  
  it('should use custom content type if provided', async () => {
    const provider = new SageMakerCompletionProvider('custom-endpoint', {
      config: {
        contentType: 'application/text',
        acceptType: 'application/text'
      }
    });
    
    expect(provider.getContentType()).toBe('application/text');
    expect(provider.getAcceptType()).toBe('application/text');
  });
  
  it('should use JSONPath extraction when configured', async () => {
    // Mock the jsonpath module
    jest.mock('jsonpath', () => ({
      query: jest.fn().mockImplementation((obj, path) => {
        if (path === '$.custom.result') {
          return ['Extracted value'];
        }
        return [];
      })
    }));
    
    const provider = new SageMakerCompletionProvider('custom-endpoint', {
      config: {
        responseFormat: {
          path: '$.custom.result'
        }
      }
    });
    
    // Force reimport of jsonpath in the parseResponse method
    // This is needed because we're mocking the module after it might have been imported
    jest.isolateModules(() => {
      const result = provider.parseResponse(JSON.stringify({ custom: { result: 'Extracted value' } }));
      expect(result).toBe('Extracted value');
    });
  });
});

describe('SageMakerEmbeddingProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with correct endpoint name', () => {
    const provider = new SageMakerEmbeddingProvider('embedding-endpoint', {});
    expect(provider.endpointName).toBe('embedding-endpoint');
    expect(provider.id()).toBe('sagemaker:embedding-endpoint');
  });
  
  it('should call SageMaker endpoint for embeddings', async () => {
    const provider = new SageMakerEmbeddingProvider('embedding-endpoint', {});
    const result = await provider.callEmbeddingApi('test text');
    
    expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(result.tokenUsage).toBeDefined();
  });
  
  it('should handle errors from embedding endpoint', async () => {
    const provider = new SageMakerEmbeddingProvider('fail-endpoint', {});
    const result = await provider.callEmbeddingApi('test text');
    
    expect(result.error).toBeDefined();
    expect(result.error).toContain('SageMaker embedding API error');
  });
  
  it('should throw error when calling callApi directly', async () => {
    const provider = new SageMakerEmbeddingProvider('embedding-endpoint', {});
    
    await expect(provider.callApi()).rejects.toThrow('callApi is not implemented for embedding provider. Use callEmbeddingApi instead.');
  });
  
  it('should format embedding request according to model type', async () => {
    const openaiProvider = new SageMakerEmbeddingProvider('embedding-endpoint', {
      config: {
        modelType: 'openai'
      }
    });
    
    const huggingfaceProvider = new SageMakerEmbeddingProvider('embedding-endpoint', {
      config: {
        modelType: 'huggingface'
      }
    });
    
    const openaiResult = await openaiProvider.callEmbeddingApi('test text');
    const huggingfaceResult = await huggingfaceProvider.callEmbeddingApi('test text');
    
    expect(openaiResult.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(huggingfaceResult.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });
});

describe('SageMaker Provider Registry', () => {
  it('should load SageMaker completion provider', async () => {
    const provider = await loadApiProvider('sagemaker:my-endpoint');
    
    expect(provider).toBeDefined();
    expect(provider.id()).toBe('sagemaker:my-endpoint');
  });
  
  it('should load SageMaker embedding provider', async () => {
    const provider = await loadApiProvider('sagemaker:embedding:my-embedding-endpoint');
    
    expect(provider).toBeDefined();
    expect(provider.id()).toBe('sagemaker:my-embedding-endpoint');
  });
  
  it('should load SageMaker provider with model type', async () => {
    const provider = await loadApiProvider('sagemaker:openai:my-openai-endpoint');
    
    expect(provider).toBeDefined();
    expect(provider.id()).toBe('sagemaker:my-openai-endpoint');
    // We can't easily test the modelType config here since it's internal
  });
});