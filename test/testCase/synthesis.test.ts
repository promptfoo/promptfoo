import dedent from 'dedent';
import { describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers/index';
import {
  extractPersonas,
  generatePersonasPrompt,
  synthesize,
  testCasesPrompt,
} from '../../src/testCase/synthesis';
import { createMockProvider } from '../factories/provider';

import type { ApiProvider, TestCase } from '../../src/types/index';

vi.mock('../../src/providers', () => ({
  loadApiProvider: vi.fn(),
}));

describe('synthesize', () => {
  it('should generate test cases based on prompts and personas', async () => {
    let i = 0;
    const mockProvider = createMockProvider({
      id: 'mock-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockImplementation(() => {
        if (i === 0) {
          i++;
          return Promise.resolve({ output: '{"personas": ["Persona 1", "Persona 2"]}' });
        }
        return Promise.resolve({ output: '{"vars": [{"var1": "value1"}, {"var2": "value2"}]}' });
      }),
    });
    vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);
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

  it.each([
    { output: '{"error": "rate limited", "status": 429}' },
    { output: '{"vars": [null]}' },
    { output: '{"vars": ["not variables"]}' },
    { error: 'provider unavailable' },
  ])('rejects malformed generated test variables: %j', async (response) => {
    const mockProvider = createMockProvider({
      id: 'mock-provider',
      callApi: vi
        .fn<ApiProvider['callApi']>()
        .mockResolvedValueOnce({ output: '{"personas": ["A customer"]}' })
        .mockResolvedValue(response),
    });
    vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    await expect(
      synthesize({
        provider: 'mock-provider',
        prompts: ['Answer {{question}}'],
        tests: [],
        numPersonas: 1,
        numTestCasesPerPersona: 1,
      }),
    ).rejects.toThrow(/vars/);
  });

  it.each([{ personas: 'Persona 1' }, { personas: [null] }])(
    'rejects unusable personas before generating cases: %j',
    async (output) => {
      const mockProvider = createMockProvider({ response: { output } });
      vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);
      await expect(
        synthesize({ provider: 'mock-provider', prompts: ['Test prompt'], tests: [] }),
      ).rejects.toThrow('Expected at least one user persona in the response');
      expect(mockProvider.callApi).toHaveBeenCalledTimes(1);
    },
  );

  it('should handle persona responses formatted as an array of objects', async () => {
    let i = 0;
    const mockProvider = createMockProvider({
      id: 'mock-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockImplementation(() => {
        if (i === 0) {
          i++;
          return Promise.resolve({
            output: JSON.stringify([
              { persona: 'Software Engineer', description: 'Builds backend systems' },
              { name: 'Product Manager', description: 'Plans features' },
            ]),
          });
        }
        return Promise.resolve({ output: '{"vars": [{"var1": "value1"}, {"var2": "value2"}]}' });
      }),
    });
    vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);
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

  it('should handle persona responses with alternative keys like user_personas', async () => {
    let i = 0;
    const mockProvider = createMockProvider({
      id: 'mock-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockImplementation(() => {
        if (i === 0) {
          i++;
          return Promise.resolve({
            output: '{"user_personas": ["Data Scientist", "ML Engineer"]}',
          });
        }
        i++;
        return Promise.resolve({ output: `{"vars": [{"var1": "val${i}"}]}` });
      }),
    });
    vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    const result = await synthesize({
      provider: 'mock-provider',
      prompts: ['Test prompt'],
      tests: [],
      numPersonas: 2,
      numTestCasesPerPersona: 1,
    });

    expect(result).toHaveLength(2);
  });

  it('should throw an informative invariant error when persona output contains no valid personas', async () => {
    const mockProvider = createMockProvider({
      id: 'mock-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockResolvedValue({
        output: '{"invalid": true}',
      }),
    });
    vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    await expect(
      synthesize({
        provider: 'mock-provider',
        prompts: ['Test prompt'],
        tests: [],
        numPersonas: 2,
        numTestCasesPerPersona: 1,
      }),
    ).rejects.toThrow(/Expected at least one user persona in the response/);
  });

  it('should find the personas object even when it is not the first JSON object in the response', async () => {
    let i = 0;
    const mockProvider = createMockProvider({
      id: 'mock-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockImplementation(() => {
        if (i === 0) {
          i++;
          // A leading, non-persona JSON object precedes the real one.
          return Promise.resolve({
            output: '{"note": "here are the personas"}\n{"personas": ["Persona 1"]}',
          });
        }
        return Promise.resolve({ output: '{"vars": [{"var1": "value1"}]}' });
      }),
    });
    vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    const result = await synthesize({
      provider: 'mock-provider',
      prompts: ['Test prompt'],
      tests: [],
      numPersonas: 1,
      numTestCasesPerPersona: 1,
    });

    expect(result).toEqual([{ var1: 'value1' }]);
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

describe('extractPersonas', () => {
  it('should extract personas from standard {personas: string[]} format', () => {
    const input = '{"personas": ["Traveler", "Tour Guide"]}';
    expect(extractPersonas(input)).toEqual(['Traveler', 'Tour Guide']);
  });

  it('should extract personas from an array of persona objects', () => {
    const input = JSON.stringify([
      { persona: 'Software Engineer', description: 'Writes code' },
      { persona: 'QA Analyst', description: 'Tests software' },
    ]);
    expect(extractPersonas(input)).toEqual(['Software Engineer', 'QA Analyst']);
  });

  it('should extract personas from an array of objects with name property', () => {
    const input = JSON.stringify([
      { name: 'Teacher', bio: 'Educator' },
      { name: 'Student', bio: 'Learner' },
    ]);
    expect(extractPersonas(input)).toEqual(['Teacher', 'Student']);
  });

  it('should extract personas from an object with user_personas key', () => {
    const input = '{"user_personas": ["Doctor", "Nurse"]}';
    expect(extractPersonas(input)).toEqual(['Doctor', 'Nurse']);
  });

  it('should extract personas from an object with personas as objects', () => {
    const input = '{"personas": [{"persona": "Chef"}, {"name": "Waiter"}]}';
    expect(extractPersonas(input)).toEqual(['Chef', 'Waiter']);
  });

  it('should extract personas from raw string array', () => {
    const input = '["Pilot", "Flight Attendant"]';
    expect(extractPersonas(input)).toEqual(['Pilot', 'Flight Attendant']);
  });

  it('should extract personas when wrapped in Markdown code blocks', () => {
    const input = '```json\n{"personas": ["Researcher", "Scientist"]}\n```';
    expect(extractPersonas(input)).toEqual(['Researcher', 'Scientist']);
  });

  it('should extract raw persona arrays wrapped in Markdown code blocks', () => {
    const input = '```json\n["Researcher", "Scientist"]\n```';
    expect(extractPersonas(input)).toEqual(['Researcher', 'Scientist']);
  });

  it('should return empty array for unparseable or invalid content', () => {
    expect(extractPersonas('No JSON here')).toEqual([]);
    expect(extractPersonas('{"unrelated": 123}')).toEqual([]);
  });
});
