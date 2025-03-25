import { runAssertion } from '../../src/assertions';
import { fetchWithRetries } from '../../src/fetch';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types';
import { setupCommonMocks } from './testUtils';

// Setup all common mocks
setupCommonMocks();

// Mock fetchWithRetries explicitly for this test
jest.mock('../../src/fetch', () => {
  const actual = jest.requireActual('../../src/fetch');
  return {
    ...actual,
    fetchWithRetries: jest.fn(),
  };
});

describe('Webhook assertion', () => {
  const webhookAssertion: Assertion = {
    type: 'webhook',
    value: 'https://example.com/webhook',
  };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when the webhook returns a passing result', async () => {
    const output = 'Expected output';

    jest.mocked(fetchWithRetries).mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ pass: true, score: 0.9, reason: 'Webhook check passed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: webhookAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: true,
      score: 0.9,
      reason: 'Webhook check passed',
    });

    // Verify the webhook was called with correct parameters
    expect(fetchWithRetries).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );

    // Verify the body contains the output
    const callBody = JSON.parse(jest.mocked(fetchWithRetries).mock.calls[0][1].body as string);
    expect(callBody).toMatchObject({
      output: 'Expected output',
    });
  });

  it('should fail when the webhook returns a failing result', async () => {
    const output = 'Different output';

    jest.mocked(fetchWithRetries).mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ pass: false, score: 0.2, reason: 'Webhook check failed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: webhookAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0.2,
      reason: 'Webhook check failed',
    });
  });

  it('should fail when the webhook returns an error status', async () => {
    const output = 'Expected output';

    jest.mocked(fetchWithRetries).mockImplementation(() =>
      Promise.resolve(
        new Response('Internal server error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    );

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: webhookAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: false,
      reason: expect.stringContaining('Webhook error: Webhook response status: 500'),
    });
  });

  it('should handle network errors with the webhook', async () => {
    const output = 'Expected output';

    jest.mocked(fetchWithRetries).mockRejectedValue(new Error('Network error'));

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: webhookAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: false,
      reason: 'Webhook error: Network error',
    });
  });

  it('should handle invalid JSON response from webhook', async () => {
    const output = 'Expected output';

    jest.mocked(fetchWithRetries).mockImplementation(() =>
      Promise.resolve(
        new Response('This is not valid JSON', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: webhookAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: false,
      reason: expect.stringContaining('Webhook error: Invalid JSON response'),
    });
  });

  it('should include additional data in webhook request when configured', async () => {
    const output = 'Expected output';
    const webhookWithDataAssertion: Assertion = {
      type: 'webhook',
      value: 'https://example.com/webhook',
      config: {
        includePrompt: true,
        includeMetadata: true,
      },
    };

    jest.mocked(fetchWithRetries).mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ pass: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await runAssertion({
      prompt: 'Test prompt',
      assertion: webhookWithDataAssertion,
      test: { vars: { key: 'value' } } as AtomicTestCase,
      providerResponse: { output, metadata: { tokens: 100 } },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    // Verify the body contains additional data
    const callBody = JSON.parse(jest.mocked(fetchWithRetries).mock.calls[0][1].body as string);
    expect(callBody).toMatchObject({
      output: 'Expected output',
      prompt: 'Test prompt',
      metadata: { tokens: 100 },
    });
  });
});
