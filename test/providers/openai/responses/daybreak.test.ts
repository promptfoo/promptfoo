import { describe, expect, it } from 'vitest';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

describe('Responses Daybreak access programs', () => {
  it.each([
    { cyber: 'standard' },
    { cyber: 'daybreak_blue' },
    { cyber: 'daybreak_red' },
    {},
  ] as const)('sends access_programs=%j', async (access_programs) => {
    const { body } = await new OpenAiResponsesProvider('gpt-6-sol', {
      config: { access_programs },
    }).getOpenAiBody('Hello');
    expect(body.access_programs).toEqual(access_programs);
  });

  it('leaves access programs unspecified by default', async () => {
    const { body } = await new OpenAiResponsesProvider('gpt-6-sol').getOpenAiBody('Hello');
    expect(body).not.toHaveProperty('access_programs');
  });

  it('applies prompt overrides without changing provider config', async () => {
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
});
