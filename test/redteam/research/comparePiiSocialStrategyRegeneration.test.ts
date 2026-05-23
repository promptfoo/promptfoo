import { describe, expect, it } from 'vitest';
import {
  comparePiiSocialStrategyRegeneration,
  renderPiiSocialStrategyRegenerationMarkdown,
} from '../../../scripts/redteam-research/comparePiiSocialStrategyRegeneration';

describe('comparePiiSocialStrategyRegeneration', () => {
  it('shows every live strategy context can be regenerated from the migrated base slice', async () => {
    await expect(comparePiiSocialStrategyRegeneration()).resolves.toEqual([
      {
        exactPromptSetMatch: true,
        liveFeaturefulAncestors: 6,
        liveRows: 6,
        regeneratedFeaturefulAncestors: 6,
        regeneratedRows: 6,
        strategyId: 'base',
      },
      {
        exactPromptSetMatch: true,
        liveFeaturefulAncestors: 6,
        liveRows: 6,
        regeneratedFeaturefulAncestors: 6,
        regeneratedRows: 6,
        strategyId: 'crescendo',
      },
      {
        exactPromptSetMatch: true,
        liveFeaturefulAncestors: 6,
        liveRows: 6,
        regeneratedFeaturefulAncestors: 6,
        regeneratedRows: 6,
        strategyId: 'goat',
      },
      {
        exactPromptSetMatch: true,
        liveFeaturefulAncestors: 6,
        liveRows: 6,
        regeneratedFeaturefulAncestors: 6,
        regeneratedRows: 6,
        strategyId: 'jailbreak',
      },
      {
        exactPromptSetMatch: true,
        liveFeaturefulAncestors: 6,
        liveRows: 6,
        regeneratedFeaturefulAncestors: 6,
        regeneratedRows: 6,
        strategyId: 'mischievous-user',
      },
    ]);
  });

  it('renders the regeneration check', async () => {
    const rows = await comparePiiSocialStrategyRegeneration();

    expect(renderPiiSocialStrategyRegenerationMarkdown(rows)).toContain(
      '| jailbreak | 6 | 6 | 6 | 6 | yes |',
    );
  });
});
