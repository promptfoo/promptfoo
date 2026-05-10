import { describe, expect, it } from 'vitest';
import { runProductionSemanticFrontierBenchmark } from '../../../scripts/redteam-research/benchmarkProductionSemanticFrontiers';

describe('benchmarkProductionSemanticFrontiers', () => {
  it('sweeps production plugins across inactive and active frontier regimes', async () => {
    const [promptExtraction, sqlInjection] = await runProductionSemanticFrontierBenchmark([4, 5]);

    expect(promptExtraction).toMatchObject({
      pluginId: 'prompt-extraction',
      rows: [
        {
          frontierActive: false,
          frontierComplete: false,
          generatedFamilyCount: 4,
          requestedCount: 4,
          selectedTestCount: 4,
        },
        {
          frontierActive: true,
          frontierComplete: true,
          generatedFamilyCount: 6,
          requestedCount: 5,
          selectedTestCount: 5,
        },
      ],
    });
    expect(sqlInjection).toMatchObject({
      pluginId: 'sql-injection',
      rows: [
        {
          frontierActive: false,
          frontierComplete: false,
          generatedFamilyCount: 4,
          requestedCount: 4,
          selectedTestCount: 4,
        },
        {
          frontierActive: true,
          frontierComplete: true,
          generatedFamilyCount: 6,
          requestedCount: 5,
          selectedTestCount: 5,
        },
      ],
    });
  });
});
