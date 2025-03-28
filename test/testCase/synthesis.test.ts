import dedent from 'dedent';
import { loadApiProvider } from '../../src/providers';
import { generatePersonasPrompt, synthesize, testCasesPrompt } from '../../src/testCase/synthesis';
import type { TestCase } from '../../src/types';

jest.mock('../../src/providers', () => ({
  loadApiProvider: jest.fn(),
}));

describe('synthesize', () => {
  it('should generate test cases based on prompts and personas', async () => {
    let i = 0;
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn(() => {
        if (i === 0) {
          i++;
          return Promise.resolve({ output: '{"personas": ["Persona 1", "Persona 2"]}' });
        }
        return Promise.resolve({ output: '{"vars": [{"var1": "value1"}, {"var2": "value2"}]}' });
      }),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    const result = await synthesize({
      provider: 'mock-provider',
      prompts: ['Test prompt'],
      tests: [],
      numPersonas: 2,
      numTestCasesPerPersona: 1,
    });

    expect(result).toHaveLength(2);
    expect(result).toEqual([{ var1: 'value1' }, { var2: 'value2' }]);
  });
});

describe('generatePersonasPrompt', () => {
  it('should generate a prompt for a single prompt input', () => {
    const prompts = ['What is the capital of France?'];
    const numPersonas = 3;
    const result = generatePersonasPrompt(prompts, numPersonas);

    expect(result).toBe(dedent`
      Consider the following prompt for an LLM application:

      <Prompts>
      <Prompt>
      What is the capital of France?
      </Prompt>
      </Prompts>

      List up to 3 user personas that would send this prompt. Your response should be JSON of the form {personas: string[]}
    `);
  });

  it('should generate a prompt for multiple prompt inputs', () => {
    const prompts = ['What is the capital of France?', 'Who wrote Romeo and Juliet?'];
    const numPersonas = 5;
    const result = generatePersonasPrompt(prompts, numPersonas);

    expect(result).toBe(dedent`
      Consider the following prompts for an LLM application:

      <Prompts>
      <Prompt>
      What is the capital of France?
      </Prompt>
      <Prompt>
      Who wrote Romeo and Juliet?
      </Prompt>
      </Prompts>

      List up to 5 user personas that would send these prompts. Your response should be JSON of the form {personas: string[]}
    `);
  });
});

describe('testCasesPrompt', () => {
  it('should generate a test cases prompt with single prompt and no existing tests', () => {
    const prompts = ['What is the capital of {{country}}?'];
    const persona = 'A curious student';
    const tests: TestCase[] = [];
    const numTestCasesPerPersona = 3;
    const variables = ['country'];
    const result = testCasesPrompt(prompts, persona, tests, numTestCasesPerPersona, variables);

    expect(result).toBe(dedent`
      Consider this prompt, which contains some {{variables}}:
      <Prompts>
      <Prompt>
      What is the capital of {{country}}?
      </Prompt>
      </Prompts>

      This is your persona:
      <Persona>
      A curious student
      </Persona>

      Here are some existing tests:

      Fully embody this persona and determine a value for each variable, such that the prompt would be sent by this persona.

      You are a tester, so try to think of 3 sets of values that would be interesting or unusual to test.

      Your response should contain a JSON map of variable names to values, of the form {vars: {country: string}[]}
    `);
  });

  it('should generate a test cases prompt with multiple prompts and existing tests', () => {
    const prompts = ['What is the capital of {{country}}?', 'What is the population of {{city}}?'];
    const persona = 'A geography enthusiast';
    const tests: TestCase[] = [
      { vars: { country: 'France', city: 'Paris' } },
      { vars: { country: 'Japan', city: 'Tokyo' } },
    ];
    const numTestCasesPerPersona = 2;
    const variables = ['country', 'city'];
    const instructions = 'Focus on less known countries and cities.';
    const result = testCasesPrompt(
      prompts,
      persona,
      tests,
      numTestCasesPerPersona,
      variables,
      instructions,
    );

    expect(result).toBe(dedent`
      Consider these prompts, which contains some {{variables}}:
      <Prompts>
      <Prompt>
      What is the capital of {{country}}?
      </Prompt>
      <Prompt>
      What is the population of {{city}}?
      </Prompt>
      </Prompts>

      This is your persona:
      <Persona>
      A geography enthusiast
      </Persona>

      Here are some existing tests:
      <Test>
        {
      "country": "France",
      "city": "Paris"
      }
        </Test>
      <Test>
        {
      "country": "Japan",
      "city": "Tokyo"
      }
        </Test>

      Fully embody this persona and determine a value for each variable, such that the prompt would be sent by this persona.

      You are a tester, so try to think of 2 sets of values that would be interesting or unusual to test. Focus on less known countries and cities.

      Your response should contain a JSON map of variable names to values, of the form {vars: {country: string, city: string}[]}
    `);
  });
});
