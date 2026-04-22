import { callApi } from '@app/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeCoverageSync, measureDiversitySync } from './generation';
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
});
