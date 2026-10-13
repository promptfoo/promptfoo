import './setup';

import { describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';
import { createCompletedResponse } from '../../../factories/literalFixtures';
import { createMockFetchResponse } from '../../mockProviderResponses';

describe('Responses Daybreak access programs', () => {
  it.each(['standard', 'daybreak_blue', 'daybreak_red'] as const)(
    'sends %s and preserves the selected program in the raw response',
    async (cyber) => {
      const model = cyber === 'daybreak_red' ? 'gpt-5.6-cyber' : 'gpt-6-sol';
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          ...createCompletedResponse('OK', 10, 20),
          model,
          access_programs: { cyber },
        }),
      );
      const provider = new OpenAiResponsesProvider(model, {
        config: { apiKey: 'test-key', access_programs: { cyber } },
      });

      const result = await provider.callApi('Hello');

      const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
      expect(body.access_programs).toEqual({ cyber });
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('OK');
      expect(result.raw).toMatchObject({ access_programs: { cyber } });
    },
  );

  it('leaves access programs unspecified by default', async () => {
    const { body } = await new OpenAiResponsesProvider('gpt-6-sol').getOpenAiBody('Hello');
    expect(body).not.toHaveProperty('access_programs');
  });

  it('preserves an empty access programs object', async () => {
    const { body } = await new OpenAiResponsesProvider('gpt-6-sol', {
      config: { access_programs: {} },
    }).getOpenAiBody('Hello');
    expect(body.access_programs).toEqual({});
  });

  it('allows a prompt to select standard safeguards without changing the provider config', async () => {
    const provider = new OpenAiResponsesProvider('gpt-6-sol', {
      config: { access_programs: { cyber: 'daybreak_blue' } },
    });
    const { body } = await provider.getOpenAiBody('Hello', {
      vars: {},
      prompt: {
        raw: 'Hello',
        label: 'standard',
        config: { access_programs: { cyber: 'standard' } },
      },
    });
    expect(body.access_programs).toEqual({ cyber: 'standard' });
    expect(provider.config.access_programs).toEqual({ cyber: 'daybreak_blue' });
  });

  it('preserves passthrough overrides', async () => {
    const { body } = await new OpenAiResponsesProvider('gpt-6-sol', {
      config: {
        access_programs: { cyber: 'daybreak_blue' },
        passthrough: { access_programs: { cyber: 'standard' } },
      },
    }).getOpenAiBody('Hello');
    expect(body.access_programs).toEqual({ cyber: 'standard' });
  });

  it.each([
    { status: 400, code: 'invalid_access_program' },
    { status: 400, code: 'unsupported_access_program' },
    { status: 403, code: 'access_program_not_enabled' },
  ])('surfaces $code without falling back to standard', async ({ status, code }) => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse(
        { error: { code, message: 'The requested access program is unavailable' } },
        { status, statusText: status === 403 ? 'Forbidden' : 'Bad Request' },
      ),
    );
    const provider = new OpenAiResponsesProvider('gpt-6-sol', {
      config: { apiKey: 'test-key', access_programs: { cyber: 'daybreak_blue' } },
    });

    const result = await provider.callApi('Hello');

    expect(result.error).toContain(code);
    expect(result.output).toBeUndefined();
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
  });
});
