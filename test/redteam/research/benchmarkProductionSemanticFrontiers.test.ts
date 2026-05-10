import { describe, expect, it } from 'vitest';
import {
  renderProductionSemanticFrontierBenchmarkMarkdown,
  runProductionSemanticFrontierBenchmark,
} from '../../../scripts/redteam-research/benchmarkProductionSemanticFrontiers';

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

  it('renders a compact markdown report at the compression threshold', async () => {
    const benchmark = await runProductionSemanticFrontierBenchmark([4, 5]);

    expect(renderProductionSemanticFrontierBenchmarkMarkdown(benchmark)).toContain(
      '| prompt-extraction | 5 | 6 | 5 | yes | yes |',
    );
    expect(renderProductionSemanticFrontierBenchmarkMarkdown(benchmark)).toContain(
      '- selected: authority-pretext, direct-disclosure, escalation-review, policy-audit, routing-review',
    );
  });
});
