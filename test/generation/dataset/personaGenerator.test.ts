import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generatePersonas,
  generateSimplePersonas,
  personaToString,
} from '../../../src/generation/dataset/personaGenerator';

import type { ApiProvider } from '../../../src/types';
import type { ConceptAnalysis, Persona } from '../../../src/generation/types';

vi.mock('../../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    level: 'info',
    child: vi.fn().mockReturnValue({}),
  },
}));

describe('personaGenerator', () => {
  let mockProvider: ApiProvider;
  let mockCallApi: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockCallApi = vi.fn();
    mockProvider = {
      id: () => 'mock-provider',
      callApi: mockCallApi,
    } as unknown as ApiProvider;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('rejects persona generation without prompts', async () => {
    await expect(generatePersonas([], mockProvider)).rejects.toThrow(
      'At least one prompt is required for persona generation',
    );
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it('generates validated grounded personas with concept context', async () => {
    const concepts: ConceptAnalysis = {
      topics: [{ name: 'Billing' }],
      entities: [{ name: 'Invoice' }],
      constraints: [{ description: 'Stay concise' }],
      variableRelationships: [],
    };
    mockCallApi.mockResolvedValue({
      output: JSON.stringify({
        personas: [
          {
            name: 'Finance Lead',
            description: 'Needs invoice summaries',
            demographics: {
              ageRange: '35-44',
              region: 'North America',
              expertise: 'expert',
              occupation: 'Controller',
            },
            goals: ['Review charges'],
            behaviors: ['Checks totals carefully'],
            edge: 'Works under a deadline',
          },
        ],
      }),
    });

    const personas = await generatePersonas(
      ['Summarize this invoice'],
      mockProvider,
      {
        count: 1,
        type: 'demographic',
      },
      concepts,
    );

    expect(personas).toHaveLength(1);
    expect(personas[0]).toMatchObject({
      name: 'Finance Lead',
      description: 'Needs invoice summaries',
    });
    expect(mockCallApi).toHaveBeenCalledWith(expect.stringContaining('Topics:** Billing'));
  });

  it('accepts object provider output and warns when fewer personas than requested are returned', async () => {
    mockCallApi.mockResolvedValue({
      output: {
        personas: [
          {
            name: 'Support Agent',
            description: 'Answers customer questions',
          },
        ],
      },
    });

    await expect(
      generatePersonas(['Respond to the customer'], mockProvider, { count: 2 }),
    ).resolves.toHaveLength(1);
  });

  it('throws when the provider omits persona output or returns malformed JSON', async () => {
    mockCallApi.mockResolvedValueOnce({});
    await expect(generatePersonas(['Prompt'], mockProvider)).rejects.toThrow(
      'Provider response output must be defined',
    );

    mockCallApi.mockResolvedValueOnce({ output: 'not-json' });
    await expect(generatePersonas(['Prompt'], mockProvider)).rejects.toThrow(
      'Expected at least one JSON object',
    );
  });

  it('throws when a parsed persona response does not contain an array', async () => {
    mockCallApi.mockResolvedValue({
      output: JSON.stringify({ personas: 'invalid' }),
    });

    await expect(generatePersonas(['Prompt'], mockProvider)).rejects.toThrow(
      'Expected personas array in response',
    );
  });

  it('salvages partial persona records and ignores unusable payload entries', async () => {
    mockCallApi.mockResolvedValue({
      output: JSON.stringify({
        personas: [
          {
            name: 'Partial Persona',
            description: 'Still useful after validation',
            demographics: { expertise: 'intermediate' },
            goals: ['Keep this', 123],
            behaviors: ['Keep this too', null],
            edge: 'Needs help',
          },
          null,
          {
            description: 'Missing a name',
          },
        ],
      }),
    });

    const personas = await generatePersonas(['Prompt'], mockProvider, { count: 3 });

    expect(personas).toEqual([
      {
        name: 'Partial Persona',
        description: 'Still useful after validation',
        demographics: { expertise: 'intermediate' },
        goals: ['Keep this'],
        behaviors: ['Keep this too'],
        edge: 'Needs help',
      },
    ]);
  });

  it('returns plain descriptions for the backward-compatible simple persona helper', async () => {
    mockCallApi.mockResolvedValue({
      output: JSON.stringify({
        personas: [
          {
            name: 'Simple',
            description: 'Simple description',
          },
        ],
      }),
    });

    await expect(generateSimplePersonas(['Prompt'], mockProvider, 1)).resolves.toEqual([
      'Simple description',
    ]);
  });

  it('formats full and minimal personas for downstream prompts', () => {
    const detailedPersona: Persona = {
      name: 'Detailed',
      description: 'Detailed persona',
      demographics: {
        ageRange: '25-34',
        region: 'Europe',
        expertise: 'novice',
        occupation: 'Analyst',
      },
      goals: ['Learn quickly'],
      behaviors: ['Asks follow-up questions'],
      edge: 'Time constrained',
    };

    expect(personaToString(detailedPersona)).toContain('Demographics: Age: 25-34');
    expect(personaToString(detailedPersona)).toContain('Goals: Learn quickly');
    expect(personaToString(detailedPersona)).toContain(
      'Behaviors: Asks follow-up questions',
    );
    expect(personaToString(detailedPersona)).toContain('Special characteristic: Time constrained');
    expect(
      personaToString({
        name: 'Minimal',
        description: 'Minimal persona',
      }),
    ).toBe('Minimal persona');
  });
});
