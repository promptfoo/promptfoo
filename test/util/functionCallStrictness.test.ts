import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { validateFunctionCall as validateGoogle } from '../../src/providers/google/util';
import { validateFunctionCall as validateOpenAI } from '../../src/providers/openai/util';

const parameters = {
  type: 'object' as const,
  properties: { email: { type: 'string', format: 'email' } },
  required: ['email'],
  property_ordering: ['email'],
  propertyOrdering: ['email'],
};

afterEach(() => vi.restoreAllMocks());

describe.each(['OpenAI', 'Google'])('%s function-call schema strictness', (provider) => {
  const validate = (email: string, unknownKeyword = true) => {
    const schema = {
      ...parameters,
      ...(unknownKeyword
        ? {
            fixtureKeyword: true,
            properties: {
              ...parameters.properties,
              metadata: { type: 'string', format: 'fixture-format' },
            },
          }
        : {}),
    };
    return provider === 'OpenAI'
      ? validateOpenAI({ name: 'fixture', arguments: JSON.stringify({ email }) }, [
          { name: 'fixture', parameters: schema },
        ])
      : validateGoogle(
          [{ functionCall: { name: 'fixture', args: { email } } }],
          [
            {
              functionDeclarations: [
                {
                  name: 'fixture',
                  parameters: {
                    ...schema,
                    type: 'OBJECT',
                    properties: {
                      email: { type: 'STRING', format: 'email' },
                      ...(unknownKeyword
                        ? { metadata: { type: 'STRING' as const, format: 'fixture-format' } }
                        : {}),
                    },
                  },
                },
              ],
            },
          ],
        );
  };

  it('accepts Gemini ordering annotations in strict mode while validating arguments', () => {
    cliState.withEnv({ PROMPTFOO_DISABLE_AJV_STRICT_MODE: 'false' }, () => {
      expect(() => validate('fixture@example.com', false)).not.toThrow();
      expect(() => validate('invalid', false)).toThrow('does not match schema');
    });
  });

  it('honors each scope after the provider module has loaded', async () => {
    await Promise.all(
      ['false', 'true'].map((disabled) =>
        cliState.withEnv({ PROMPTFOO_DISABLE_AJV_STRICT_MODE: disabled }, async () => {
          await Promise.resolve();
          if (disabled === 'true') {
            expect(() => validate('fixture@example.com')).not.toThrow();
            expect(() => validate('invalid')).toThrow('does not match schema');
          } else {
            expect(() => validate('fixture@example.com')).toThrow(/unknown (keyword|format)/);
          }
        }),
      ),
    );
  });
});
