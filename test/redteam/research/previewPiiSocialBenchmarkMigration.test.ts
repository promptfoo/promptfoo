import { describe, expect, it } from 'vitest';
import {
  previewPiiSocialBenchmarkMigration,
  renderPiiSocialBenchmarkMigrationPreviewMarkdown,
} from '../../../scripts/redteam-research/previewPiiSocialBenchmarkMigration';

describe('previewPiiSocialBenchmarkMigration', () => {
  it('materializes the planned refreshed benchmark shape without editing the source file', async () => {
    const preview = await previewPiiSocialBenchmarkMigration();

    expect(preview.legacyRows).toBe(35);
    expect(preview.previewRows).toBe(30);
    expect(preview.refreshedRows).toHaveLength(30);
    expect(preview.replacedLegacyPrompts).toHaveLength(5);
    expect(preview.refreshedRows.filter((row) => row.strategyId === 'jailbreak')).toHaveLength(6);
  });

  it('renders the migration preview', async () => {
    const preview = await previewPiiSocialBenchmarkMigration();

    expect(renderPiiSocialBenchmarkMigrationPreviewMarkdown(preview)).toContain(
      '| 35 | 30 | -5 |',
    );
  });
});
