import { describe, expect, it } from 'vitest';
import {
  renderSemanticFrontierStatusMarkdown,
  summarizeSemanticFrontierStatus,
} from '../../../scripts/redteam-research/summarizeSemanticFrontierStatus';

describe('summarizeSemanticFrontierStatus', () => {
  it('summarizes productionized frontier shapes and recommends pii social next', async () => {
    await expect(summarizeSemanticFrontierStatus()).resolves.toMatchObject({
      candidates: [
        {
          addsNewShape: true,
          pluginId: 'pii:social',
          recommendation: 'next informative target',
        },
        {
          addsNewShape: true,
          pluginId: 'excessive-agency',
          recommendation: 'defer',
        },
      ],
      production: [
        {
          frontierBandCount: 1,
          parity: true,
          pluginId: 'pii:direct',
        },
        {
          frontierBandCount: 2,
          parity: true,
          pluginId: 'prompt-extraction',
        },
        {
          frontierBandCount: 2,
          parity: true,
          pluginId: 'sql-injection',
        },
      ],
    });
  });

  it('renders the semantic frontier status report', async () => {
    const status = await summarizeSemanticFrontierStatus();

    expect(renderSemanticFrontierStatusMarkdown(status)).toContain(
      '| pii:social | coarser-rollup + separate-concept | yes | next informative target |',
    );
    expect(renderSemanticFrontierStatusMarkdown(status)).toContain(
      '| excessive-agency | exact-projection | yes | defer |',
    );
  });
});
