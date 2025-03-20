import nock from 'nock';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';

describe('OpenAiResponsesProvider', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  it('should support various model names', () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-mini');
  });

  it('should format and call the responses API correctly', async () => {
    // Mock API response
    const mockApiResponse = {
      id: 'resp_abc123',
      object: 'response',
      created_at: 1234567890,
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          id: 'msg_abc123',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'This is a test response',
            },
          ],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
      },
    };

    // Set up the mock server
    nock('https://api.openai.com').post('/v1/responses').reply(200, mockApiResponse);

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Assertions
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('This is a test response');
    expect(result.tokenUsage).toMatchObject({
      total: 30,
      prompt: 10,
      completion: 20,
    });
  });

  it('should handle reasoning models correctly', async () => {
    // Mock API response for o1-pro model
    const mockApiResponse = {
      id: 'resp_abc123',
      object: 'response',
      created_at: 1234567890,
      status: 'completed',
      model: 'o1-pro',
      output: [
        {
          type: 'message',
          id: 'msg_abc123',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'This is a response from o1-pro',
            },
          ],
        },
      ],
      usage: {
        input_tokens: 15,
        output_tokens: 30,
        output_tokens_details: {
          reasoning_tokens: 100,
        },
        total_tokens: 45,
      },
    };

    // Set up the mock server
    nock('https://api.openai.com')
      .post('/v1/responses', (body) => {
        // Verify that reasoning effort is included
        return body.reasoning && body.reasoning.effort === 'medium';
      })
      .reply(200, mockApiResponse);

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('o1-pro', {
      config: {
        apiKey: 'test-key',
        reasoning_effort: 'medium',
        max_completion_tokens: 2000,
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Assertions
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('This is a response from o1-pro');
    expect(result.tokenUsage).toMatchObject({
      total: 45,
      prompt: 15,
      completion: 30,
    });
    expect(result.tokenUsage?.completionDetails?.reasoning).toBe(100);
  });

  it('should handle structured input correctly', async () => {
    // Mock API response
    const mockApiResponse = {
      id: 'resp_abc123',
      object: 'response',
      created_at: 1234567890,
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          id: 'msg_abc123',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'I see an image of a sunset',
            },
          ],
        },
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      },
    };

    // Set up the mock server
    nock('https://api.openai.com')
      .post('/v1/responses', (body) => {
        // Verify that the input is passed correctly as an array
        return Array.isArray(body.input) && body.input[0].type === 'message';
      })
      .reply(200, mockApiResponse);

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    // Create structured input
    const structuredInput = JSON.stringify([
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Describe this image:',
          },
          {
            type: 'image_url',
            image_url: {
              url: 'https://example.com/image.jpg',
            },
          },
        ],
      },
    ]);

    // Call the API
    const result = await provider.callApi(structuredInput);

    // Assertions
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('I see an image of a sunset');
  });

  it('should handle API errors correctly', async () => {
    // Set up the mock server to return an error
    nock('https://api.openai.com')
      .post('/v1/responses')
      .reply(400, {
        error: {
          message: 'Invalid request',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      });

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'invalid-key',
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Assertions
    expect(result.error).toContain('API error');
    expect(result.output).toBeUndefined();
  });
});
