import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { validateFunctionCall as validateGoogle } from '../../src/providers/google/util';
import { validateFunctionCall as validateOpenAI } from '../../src/providers/openai/util';

const parameters = {
  type: 'object' as const,
  properties: { email: { type: 'string', format: 'email' } },
  required: ['email'],
  fixtureKeyword: true,
  property_ordering: ['email'],
  propertyOrdering: ['email'],
};

afterEach(() => vi.restoreAllMocks());

describe.each(['OpenAI', 'Google'])('%s function-call schema strictness', (provider) => {
  const validate = (email: string) =>
    provider === 'OpenAI'
      ? validateOpenAI({ name: 'fixture', arguments: JSON.stringify({ email }) }, [
          { name: 'fixture', parameters },
        ])
      : validateGoogle(
          [{ functionCall: { name: 'fixture', args: { email } } }],
          [
            {
              functionDeclarations: [
                {
                  name: 'fixture',
                  parameters: {
                    ...parameters,
                    type: 'OBJECT',
                    properties: { email: { type: 'STRING', format: 'email' } },
                  },
                },
              ],
            },
          ],
        );

  it('honors each scope after the provider module has loaded', async () => {
    await Promise.all(
      ['false', 'true'].map((disabled) =>
        cliState.withEnv({ PROMPTFOO_DISABLE_AJV_STRICT_MODE: disabled }, async () => {
          await Promise.resolve();
          if (disabled === 'true') {
            expect(() => validate('fixture@example.com')).not.toThrow();
            expect(() => validate('invalid')).toThrow('does not match schema');
          } else {
            expect(() => validate('fixture@example.com')).toThrow('unknown keyword');
          }
        }),
      ),
    );
  });
});
