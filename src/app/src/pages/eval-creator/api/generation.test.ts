import { callApi } from '@app/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeConceptsSync,
  analyzeCoverageSync,
  cancelGenerationJob,
  generateAssertions,
  generateDataset,
  generateTestSuite,
  getGenerationCapabilities,
  getJobStatus,
  measureDiversitySync,
} from './generation';
import type { Assertion } from '@promptfoo/types';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

const mockCallApi = vi.mocked(callApi);

function jsonResponse(body: unknown) {
  return {
    json: async () => body,
  } as Response;
}

describe('eval creator generation API', () => {
  beforeEach(() => {
    mockCallApi.mockReset();
  });

  it('normalizes backend coverage responses to the frontend shape', async () => {
    mockCallApi.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          coverage: {
            requirements: [
              {
                requirement: {
                  id: 'req-1',
                  description: 'Response must be JSON',
                  source: 'explicit',
                  testability: 'objective',
                },
                coveredBy: ['assertion-0'],
                coverageLevel: 'partial',
              },
            ],
            overallScore: 0.5,
            gaps: ['Response format needs stronger coverage'],
          },
        },
      }),
    );

    const coverage = await analyzeCoverageSync(
      ['Return JSON'],
      [{ type: 'contains-json' } as Assertion],
    );

    expect(mockCallApi).toHaveBeenCalledWith('/generation/assertions/analyze-coverage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompts: ['Return JSON'],
        assertions: [{ type: 'contains-json' }],
      }),
    });
    expect(coverage).toEqual({
      requirements: [
        {
          id: 'req-1',
          description: 'Response must be JSON',
          coverageLevel: 'partial',
          matchingAssertions: ['assertion-0'],
        },
      ],
      overallScore: 0.5,
      gaps: ['Response format needs stronger coverage'],
    });
  });

  it('normalizes backend diversity metric field names', async () => {
    mockCallApi.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          diversity: {
            score: 0.72,
            clusterCount: 3,
            coverageGaps: ['city has low diversity'],
            averageDistance: 0.72,
            minDistance: 0.1,
            maxDistance: 0.9,
          },
        },
      }),
    );

    const diversity = await measureDiversitySync([{ vars: { city: 'Paris' } }]);

    expect(diversity).toEqual({
      score: 0.72,
      clusters: 3,
      gaps: ['city has low diversity'],
    });
  });

  it('starts generation jobs and surfaces backend failures', async () => {
    mockCallApi
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { jobId: 'dataset-1' } }))
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'not allowed' }));

    await expect(
      generateDataset([{ raw: 'Return JSON', label: 'Prompt' }], [{ vars: { city: 'Paris' } }], {
        numPersonas: 2,
      }),
    ).resolves.toEqual({ jobId: 'dataset-1' });

    await expect(
      generateAssertions([{ raw: 'Return JSON', label: 'Prompt' }], [], {
        numAssertions: 2,
      }),
    ).rejects.toThrow('not allowed');
  });

  it('starts combined generation jobs and validates malformed responses', async () => {
    mockCallApi
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { jobId: 'tests-1' } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: {} }));

    await expect(
      generateTestSuite([{ raw: 'Return JSON', label: 'Prompt' }], [], { parallel: true }),
    ).resolves.toEqual({ jobId: 'tests-1' });

    await expect(
      generateDataset([{ raw: 'Return JSON', label: 'Prompt' }], [], {}),
    ).rejects.toThrow('Invalid response from server');
  });

  it('normalizes nested coverage while reading job status', async () => {
    mockCallApi.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          job: {
            id: 'job-1',
            type: 'combined',
            status: 'complete',
            progress: 1,
            total: 1,
            phase: 'Done',
            createdAt: '2026-05-16T00:00:00.000Z',
            updatedAt: '2026-05-16T00:00:01.000Z',
            result: {
              assertions: {
                coverage: {
                  requirements: [
                    {
                      requirement: {
                        id: 'req-2',
                        description: 'Stay concise',
                      },
                      coveredBy: ['assertion-2'],
                      coverageLevel: 'full',
                    },
                  ],
                  overallScore: 1,
                  gaps: [],
                },
              },
            },
          },
        },
      }),
    );

    const job = await getJobStatus('tests', 'job-1');

    expect(mockCallApi).toHaveBeenCalledWith('/generation/tests/job/job-1');
    expect(job.result).toEqual({
      assertions: {
        coverage: {
          requirements: [
            {
              id: 'req-2',
              description: 'Stay concise',
              coverageLevel: 'full',
              matchingAssertions: ['assertion-2'],
            },
          ],
          overallScore: 1,
          gaps: [],
        },
      },
    });
  });

  it('cancels a generation job through the shared job endpoint', async () => {
    mockCallApi.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          job: {
            id: 'job-cancel',
            type: 'dataset',
            status: 'cancelled',
            progress: 2,
            total: 5,
            phase: 'Cancelled',
            createdAt: '2026-05-16T00:00:00.000Z',
            updatedAt: '2026-05-16T00:00:01.000Z',
          },
        },
      }),
    );

    await expect(cancelGenerationJob('job-cancel')).resolves.toMatchObject({
      id: 'job-cancel',
      status: 'cancelled',
    });
    expect(mockCallApi).toHaveBeenCalledWith('/generation/jobs/job-cancel/cancel', {
      method: 'POST',
    });
  });

  it('normalizes frontend-shaped and top-level job coverage results', async () => {
    mockCallApi.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          job: {
            id: 'job-2',
            type: 'assertions',
            status: 'complete',
            progress: 1,
            total: 1,
            phase: 'Done',
            createdAt: '2026-05-16T00:00:00.000Z',
            updatedAt: '2026-05-16T00:00:01.000Z',
            result: {
              coverage: {
                requirements: [
                  {
                    id: 'req-3',
                    description: 'Mention tradeoffs',
                    coverageLevel: 'partial',
                    matchingAssertions: ['assertion-3'],
                  },
                  {
                    id: '',
                    description: '',
                    coverageLevel: undefined,
                    matchingAssertions: 'unexpected',
                  },
                ],
                overallScore: 0.6,
                gaps: ['Need a tradeoff assertion'],
              },
            },
          },
        },
      }),
    );

    const job = await getJobStatus('assertions', 'job-2');

    expect(job.result).toEqual({
      coverage: {
        requirements: [
          {
            id: 'req-3',
            description: 'Mention tradeoffs',
            coverageLevel: 'partial',
            matchingAssertions: ['assertion-3'],
          },
          {
            id: '',
            description: '',
            coverageLevel: 'none',
            matchingAssertions: [],
          },
        ],
        overallScore: 0.6,
        gaps: ['Need a tradeoff assertion'],
      },
    });
  });

  it('handles synchronous concept analysis and wrapped diversity test cases', async () => {
    mockCallApi
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            concepts: {
              topics: [{ name: 'JSON' }],
              entities: [{ name: 'schema' }],
              constraints: [{ description: 'Return JSON' }],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            diversity: {
              score: 0.9,
              clusters: 4,
              gaps: ['coverage gap'],
            },
          },
        }),
      );

    await expect(analyzeConceptsSync(['Return JSON'])).resolves.toMatchObject({
      topics: [{ name: 'JSON' }],
    });
    await expect(measureDiversitySync([{ vars: { city: 'Paris' } }])).resolves.toEqual({
      score: 0.9,
      clusters: 4,
      gaps: ['coverage gap'],
    });

    expect(mockCallApi).toHaveBeenLastCalledWith('/generation/dataset/measure-diversity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testCases: [{ city: 'Paris' }] }),
    });
  });

  it('falls back when capabilities checks fail or return unsuccessful data', async () => {
    mockCallApi
      .mockResolvedValueOnce(jsonResponse({ success: false }))
      .mockRejectedValueOnce(new Error('offline'));

    await expect(getGenerationCapabilities()).resolves.toEqual({
      hasPiAccess: false,
      defaultAssertionType: 'llm-rubric',
    });
    await expect(getGenerationCapabilities()).resolves.toEqual({
      hasPiAccess: false,
      defaultAssertionType: 'llm-rubric',
    });
  });

  it('returns successful capabilities data and rejects invalid synchronous payloads', async () => {
    mockCallApi
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { hasPiAccess: true, defaultAssertionType: 'pi' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'concepts unavailable' }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: {} }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            coverage: {
              requirements: [{ unexpected: true }],
              overallScore: 'bad',
              gaps: [],
            },
          },
        }),
      );

    await expect(getGenerationCapabilities()).resolves.toEqual({
      hasPiAccess: true,
      defaultAssertionType: 'pi',
    });
    await expect(analyzeConceptsSync(['Return JSON'])).rejects.toThrow('concepts unavailable');
    await expect(measureDiversitySync([{ city: 'Paris' }])).rejects.toThrow(
      'Invalid response from server',
    );
    await expect(
      analyzeCoverageSync(['Return JSON'], [{ type: 'contains-json' } as Assertion]),
    ).resolves.toEqual({
      requirements: [
        {
          id: '',
          description: '',
          coverageLevel: 'none',
          matchingAssertions: [],
        },
      ],
      overallScore: 0,
      gaps: [],
    });
  });

  it('rejects malformed coverage payloads after normalization', async () => {
    mockCallApi.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          coverage: {
            requirements: 'not-an-array',
          },
        },
      }),
    );

    await expect(
      analyzeCoverageSync(['Return JSON'], [{ type: 'contains-json' } as Assertion]),
    ).rejects.toThrow('Invalid coverage data returned from server');
  });

  it('returns job status failures from the backend response', async () => {
    mockCallApi.mockResolvedValue(jsonResponse({ success: false, error: 'job lookup failed' }));

    await expect(getJobStatus('dataset', 'missing')).rejects.toThrow('job lookup failed');
  });
});
