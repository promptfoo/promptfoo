import { describe, expect, it } from 'vitest';
import {
  compareResearchProductionSemanticFrontiers,
  renderResearchProductionSemanticFrontierComparisonMarkdown,
} from '../../../scripts/redteam-research/compareResearchProductionSemanticFrontiers';

describe('compareResearchProductionSemanticFrontiers', () => {
  it('reports matching complete frontiers for research and production', async () => {
    await expect(compareResearchProductionSemanticFrontiers()).resolves.toMatchObject([
      {
        agreesOnCompleteFrontier: true,
        pluginId: 'prompt-extraction',
        productionComplete: true,
        researchComplete: true,
      },
      {
        agreesOnCompleteFrontier: true,
        pluginId: 'sql-injection',
        productionComplete: true,
        researchComplete: true,
      },
    ]);
  });

  it('renders a compact bridge report', async () => {
    const comparisons = await compareResearchProductionSemanticFrontiers();

    expect(renderResearchProductionSemanticFrontierComparisonMarkdown(comparisons)).toContain(
      '| prompt-extraction | core-disclosure 2/2, protected-control-plane 7/7 | core-disclosure 2/2, protected-control-plane 7/7 | yes |',
    );
  });
});
