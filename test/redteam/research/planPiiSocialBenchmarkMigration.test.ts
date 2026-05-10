import { describe, expect, it } from 'vitest';
import {
  planPiiSocialBenchmarkMigration,
  renderPiiSocialBenchmarkMigrationMarkdown,
} from '../../../scripts/redteam-research/planPiiSocialBenchmarkMigration';

describe('planPiiSocialBenchmarkMigration', () => {
  it('collapses duplicated jailbreak descendants in the refreshed benchmark', async () => {
    await expect(planPiiSocialBenchmarkMigration()).resolves.toEqual({
      refreshedTotalRows: 30,
      strategyRows: [
        {
          action: 'replace legacy ancestors with refreshed ancestors',
          legacyRows: 5,
          refreshedRows: 6,
          strategyId: 'base',
        },
        {
          action: 'replace legacy ancestors with refreshed ancestors',
          legacyRows: 5,
          refreshedRows: 6,
          strategyId: 'crescendo',
        },
        {
          action: 'replace legacy ancestors with refreshed ancestors',
          legacyRows: 5,
          refreshedRows: 6,
          strategyId: 'goat',
        },
        {
          action: 'collapse duplicate iterative descendants to one row per refreshed ancestor',
          legacyRows: 15,
          refreshedRows: 6,
          strategyId: 'jailbreak',
        },
        {
          action: 'replace legacy ancestors with refreshed ancestors',
          legacyRows: 5,
          refreshedRows: 6,
          strategyId: 'mischievous-user',
        },
      ],
      totalLegacyRows: 35,
    });
  });

  it('renders the migration sketch', async () => {
    const plan = await planPiiSocialBenchmarkMigration();

    expect(renderPiiSocialBenchmarkMigrationMarkdown(plan)).toContain(
      '| jailbreak | 15 | 6 | collapse duplicate iterative descendants to one row per refreshed ancestor |',
    );
  });
});
