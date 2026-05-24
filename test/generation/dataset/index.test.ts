import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateDataset, synthesize } from '../../../src/generation/dataset';
import { extractConcepts } from '../../../src/generation/dataset/conceptExtractor';
import {
  identifyGaps,
  measureDiversity,
} from '../../../src/generation/dataset/diversityMeasurement';
import { generateEdgeCases } from '../../../src/generation/dataset/edgeCaseGenerator';
import {
  generatePersonas,
  personaToString,
} from '../../../src/generation/dataset/personaGenerator';
import { jobEventEmitter } from '../../../src/generation/shared/jobManager';
import { getDefaultProviders } from '../../../src/providers/defaults';
import { loadApiProvider } from '../../../src/providers/index';
import { retryWithDeduplication } from '../../../src/util/generation';

import type { ApiProvider } from '../../../src/types';

vi.mock('../../../src/providers/defaults', () => ({
  getDefaultProviders: vi.fn(),
}));

vi.mock('../../../src/providers/index', () => ({
  loadApiProvider: vi.fn(),
}));

vi.mock('../../../src/generation/dataset/conceptExtractor', () => ({
  extractConcepts: vi.fn(),
  extractEntities: vi.fn(),
  extractTopics: vi.fn(),
}));

vi.mock('../../../src/generation/dataset/diversityMeasurement', () => ({
  analyzeVariableCoverage: vi.fn(),
  identifyGaps: vi.fn(),
  measureDiversity: vi.fn(),
}));

vi.mock('../../../src/generation/dataset/edgeCaseGenerator', () => ({
  generateEdgeCases: vi.fn(),
  generateEdgeCasesByType: vi.fn(),
}));

vi.mock('../../../src/generation/dataset/personaGenerator', () => ({
  generatePersonas: vi.fn(),
  generateSimplePersonas: vi.fn(),
  personaToString: vi.fn(),
}));

vi.mock('../../../src/util/generation', async () => {
  const actual = await vi.importActual<typeof import('../../../src/util/generation')>(
    '../../../src/util/generation',
  );
  return {
    ...actual,
    retryWithDeduplication: vi.fn(async (operation, targetCount) => {
      const first = await operation([]);
      return first.slice(0, targetCount);
    }),
  };
});

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

describe('generation dataset index', () => {
  let callApi: ReturnType<typeof vi.fn>;
  let provider: ApiProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    callApi = vi.fn();
    provider = {
      id: () => 'dataset-provider',
      callApi,
    } as unknown as ApiProvider;
    vi.mocked(getDefaultProviders).mockResolvedValue({
      synthesizeProvider: provider,
    } as never);
    vi.mocked(loadApiProvider).mockResolvedValue(provider);
    vi.mocked(personaToString).mockReturnValue('Detailed persona');
    vi.mocked(generatePersonas).mockResolvedValue([
      { name: 'Persona', description: 'Detailed persona' },
    ] as never);
    vi.mocked(extractConcepts).mockResolvedValue({
      topics: [{ name: 'Billing' }],
      entities: [{ name: 'Invoice' }],
      constraints: [{ description: 'Use JSON' }],
      variableRelationships: [],
    } as never);
    vi.mocked(generateEdgeCases).mockResolvedValue([
      { vars: { city: 'Edge City' }, type: 'boundary', description: 'Edge' },
    ] as never);
    vi.mocked(measureDiversity)
      .mockResolvedValueOnce({
        score: 0.2,
        averageDistance: 0.2,
        minDistance: 0.1,
        maxDistance: 0.3,
      } as never)
      .mockResolvedValue({
        score: 0.9,
        averageDistance: 0.9,
        minDistance: 0.8,
        maxDistance: 1,
      } as never);
    vi.mocked(identifyGaps).mockResolvedValue(['Missing invoice scenario']);
  });

  afterEach(() => {
    vi.resetAllMocks();
    jobEventEmitter.removeAllListeners();
  });

  it('rejects empty prompt input', async () => {
    await expect(generateDataset([], [])).rejects.toThrow(
      'Dataset generation requires at least one prompt',
    );
  });

  it('generates datasets with concepts, edge cases, diversity, and iterative refinement', async () => {
    callApi
      .mockResolvedValueOnce({
        output: JSON.stringify({ vars: [{ city: 'Paris' }] }),
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({ vars: [{ city: 'Berlin' }] }),
      });

    const testCaseEvents: unknown[] = [];
    jobEventEmitter.on('job:dataset-job', (event) => {
      if (event.type === 'testcase') {
        testCaseEvents.push(event.testCase);
      }
    });

    const result = await generateDataset(
      [{ raw: 'Recommend travel to {{city}}', label: 'Prompt' }],
      [{ vars: { city: 'Existing' } }],
      {
        concepts: { maxTopics: 2, maxEntities: 10, extractRelationships: true },
        edgeCases: {
          enabled: true,
          types: ['boundary', 'format', 'empty', 'special-chars'],
          count: 10,
          includeAdversarial: false,
        },
        diversity: { enabled: true, targetScore: 0.7, measureMethod: 'embedding' },
        iterative: { enabled: true, maxRounds: 1, targetDiversity: 0.8 },
        numPersonas: 1,
        numTestCasesPerPersona: 1,
      },
      { jobId: 'dataset-job', onProgress: vi.fn() },
    );

    expect(result).toMatchObject({
      testCases: [{ city: 'Paris' }, { city: 'Berlin' }],
      edgeCases: [{ vars: { city: 'Edge City' }, type: 'boundary', description: 'Edge' }],
      metadata: {
        totalGenerated: 2,
        provider: 'dataset-provider',
        iterationRounds: 1,
      },
    });
    expect(extractConcepts).toHaveBeenCalled();
    expect(generateEdgeCases).toHaveBeenCalled();
    expect(measureDiversity).toHaveBeenCalledTimes(2);
    expect(identifyGaps).toHaveBeenCalled();
    expect(retryWithDeduplication).toHaveBeenCalled();
    expect(testCaseEvents).toEqual([{ city: 'Paris' }, { city: 'Edge City' }, { city: 'Berlin' }]);
  });

  it('supports explicit providers, no-gap iterative exit, and the synthesize compatibility wrapper', async () => {
    vi.mocked(measureDiversity)
      .mockReset()
      .mockResolvedValue({
        score: 0.95,
        averageDistance: 0.95,
        minDistance: 0.9,
        maxDistance: 1,
      } as never);
    callApi.mockResolvedValue({
      output: JSON.stringify({ vars: [{ city: 'Tokyo' }] }),
    });

    const result = await generateDataset([{ raw: 'Visit {{city}}', label: 'Prompt' }], [], {
      provider: 'custom-provider',
      concepts: { maxTopics: 1, maxEntities: 10, extractRelationships: true },
      iterative: { enabled: true, maxRounds: 2, targetDiversity: 0.7 },
      numPersonas: 1,
      numTestCasesPerPersona: 1,
    });

    expect(loadApiProvider).toHaveBeenCalledWith('custom-provider', expect.any(Object));
    expect(result.metadata.iterationRounds).toBeUndefined();
    expect(identifyGaps).not.toHaveBeenCalled();

    callApi.mockResolvedValueOnce({
      output: JSON.stringify({ vars: [{ city: 'Oslo' }] }),
    });
    await expect(
      synthesize({
        prompts: ['Visit {{city}}'],
        tests: [],
        numPersonas: 1,
        numTestCasesPerPersona: 1,
      }),
    ).resolves.toEqual([{ city: 'Oslo' }]);
  });

  it('surfaces missing and malformed provider outputs during testcase and gap generation', async () => {
    callApi.mockResolvedValueOnce({});
    await expect(
      generateDataset([{ raw: 'Visit {{city}}', label: 'Prompt' }], [], {
        numPersonas: 1,
        numTestCasesPerPersona: 1,
      }),
    ).rejects.toThrow('Provider response must have output');

    callApi.mockResolvedValueOnce({ output: 'not-json' });
    await expect(
      generateDataset([{ raw: 'Visit {{city}}', label: 'Prompt' }], [], {
        numPersonas: 1,
        numTestCasesPerPersona: 1,
      }),
    ).rejects.toThrow('Expected at least one JSON object in test case response');
  });
});
