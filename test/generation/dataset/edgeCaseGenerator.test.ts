import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateEdgeCases,
  generateEdgeCasesByType,
} from '../../../src/generation/dataset/edgeCaseGenerator';

import type { ApiProvider } from '../../../src/types';
import type { ConceptAnalysis } from '../../../src/generation/types';

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

describe('edgeCaseGenerator', () => {
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

  it('rejects empty prompt input and exits early when disabled', async () => {
    await expect(generateEdgeCases([], mockProvider)).rejects.toThrow(
      'At least one prompt is required for edge case generation',
    );
    await expect(
      generateEdgeCases(['Hello {{name}}'], mockProvider, { enabled: false }),
    ).resolves.toEqual([]);
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it('returns predefined generic cases when no prompt variables exist', async () => {
    const edgeCases = await generateEdgeCases(['No template variables here'], mockProvider, {
      types: ['empty', 'special-chars', 'length', 'boundary', 'format'],
      count: 5,
    });

    expect(edgeCases).toHaveLength(5);
    expect(edgeCases.map((edgeCase) => edgeCase.type)).toEqual(
      expect.arrayContaining(['empty', 'special-chars', 'length']),
    );
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it('parses generated edge cases, validates severity, and skips invalid payloads', async () => {
    const concepts: ConceptAnalysis = {
      topics: [{ name: 'Support' }],
      entities: [{ name: 'Customer' }],
      constraints: [{ description: 'Be polite', type: 'style' }],
      variableRelationships: [],
    };
    mockCallApi.mockResolvedValue({
      output: JSON.stringify({
        edgeCases: [
          {
            vars: { name: 'Ada' },
            type: 'boundary',
            description: 'Boundary input',
            severity: 'high',
          },
          {
            vars: { name: 'Grace' },
            type: 'format',
            description: 'Format input',
            severity: 'unknown',
          },
          null,
          {
            vars: null,
            type: 'empty',
            description: 'Missing vars',
          },
          {
            vars: { name: 'Lin' },
            type: 'invalid',
            description: 'Invalid type',
          },
        ],
      }),
    });

    const edgeCases = await generateEdgeCases(
      ['Hello {{name}}'],
      mockProvider,
      {
        count: 2,
        includeAdversarial: true,
        types: ['boundary', 'format'],
      },
      concepts,
    );

    expect(edgeCases).toEqual([
      {
        vars: { name: 'Ada' },
        type: 'boundary',
        description: 'Boundary input',
        severity: 'high',
      },
      {
        vars: { name: 'Grace' },
        type: 'format',
        description: 'Format input',
        severity: undefined,
      },
    ]);
    expect(mockCallApi).toHaveBeenCalledWith(expect.stringContaining('Context from Concept Analysis'));
    expect(mockCallApi).toHaveBeenCalledWith(expect.stringContaining('ADVERSARIAL'));
  });

  it('supports object provider output and fills short generations with predefined edge cases', async () => {
    mockCallApi.mockResolvedValue({
      output: {
        edgeCases: [
          {
            vars: { query: 'Short' },
            type: 'empty',
            description: 'Only generated item',
          },
        ],
      },
    });

    const edgeCases = await generateEdgeCases(['Ask about {{query}}'], mockProvider, {
      count: 5,
      types: ['empty', 'length'],
    });

    expect(edgeCases).toHaveLength(5);
    expect(edgeCases[0]).toMatchObject({
      type: 'empty',
      description: 'Only generated item',
    });
    expect(edgeCases.slice(1).map((edgeCase) => edgeCase.type)).toEqual(
      expect.arrayContaining(['empty', 'length']),
    );
  });

  it('throws for missing output, malformed JSON, and invalid parsed edge case collections', async () => {
    mockCallApi
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ output: 'not-json' })
      .mockResolvedValueOnce({ output: JSON.stringify({ edgeCases: 'invalid' }) });

    await expect(generateEdgeCases(['Hello {{name}}'], mockProvider)).rejects.toThrow(
      'Provider response output must be defined',
    );
    await expect(generateEdgeCases(['Hello {{name}}'], mockProvider)).rejects.toThrow(
      'Expected at least one JSON object',
    );
    await expect(generateEdgeCases(['Hello {{name}}'], mockProvider)).rejects.toThrow(
      'Expected edgeCases array in response',
    );
  });

  it('expands count and adversarial handling for type-specific generation', async () => {
    mockCallApi.mockResolvedValue({
      output: JSON.stringify({
        edgeCases: [
          {
            vars: { prompt: 'Break it' },
            type: 'adversarial',
            description: 'Adversarial probe',
          },
          {
            vars: { prompt: 'Tiny' },
            type: 'boundary',
            description: 'Boundary probe',
          },
        ],
      }),
    });

    await expect(
      generateEdgeCasesByType(
        ['Probe {{prompt}}'],
        mockProvider,
        ['adversarial', 'boundary'],
        1,
      ),
    ).resolves.toHaveLength(2);
    expect(mockCallApi).toHaveBeenCalledWith(expect.stringContaining('ADVERSARIAL'));
  });
});
