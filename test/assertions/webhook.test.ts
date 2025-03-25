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

  it('should pass when the webhook assertion passes', async () => {
    const output = 'Expected output';

    jest.mocked(fetchWithRetries).mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ pass: true }), {
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
      reason: 'Assertion passed',
    });
  });

  it('should fail when the webhook assertion fails', async () => {
    const output = 'Different output';
    jest.mocked(fetchWithRetries).mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ pass: false }), {
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
      reason: 'Webhook returned false',
    });
  });

  it('should fail when the webhook returns an error', async () => {
    const output = 'Expected output';

    jest.mocked(fetchWithRetries).mockImplementation(() =>
      Promise.resolve(
        new Response('', {
          status: 500,
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
      reason: 'Webhook error: Webhook response status: 500',
    });
  });
});
