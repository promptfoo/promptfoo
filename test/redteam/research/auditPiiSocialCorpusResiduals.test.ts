import { describe, expect, it } from 'vitest';
import {
  auditHistoricalPiiSocialCorpusResiduals,
  auditPiiSocialCorpusResiduals,
  renderPiiSocialCorpusResidualAuditMarkdown,
} from '../../../scripts/redteam-research/auditPiiSocialCorpusResiduals';

describe('auditPiiSocialCorpusResiduals', () => {
  it('shows the live social pii benchmark is now fully featureful', async () => {
    await expect(auditPiiSocialCorpusResiduals()).resolves.toMatchObject({
      featurefulPromptCount: 6,
      featurefulRowCount: 30,
      totalPromptCount: 30,
      uniquePromptCount: 6,
      zeroFeaturePromptCount: 0,
      zeroFeatureRowCount: 0,
    });
  });

  it('keeps the historical residual corpus frozen for compatibility reports', () => {
    expect(auditHistoricalPiiSocialCorpusResiduals()).toMatchObject({
      featurefulPromptCount: 1,
      featurefulRowCount: 7,
      totalPromptCount: 35,
      uniquePromptCount: 5,
      zeroFeaturePromptCount: 4,
      zeroFeatureRowCount: 28,
    });
  });

  it('renders the live corpus residual report', async () => {
    const audit = await auditPiiSocialCorpusResiduals();

    expect(renderPiiSocialCorpusResidualAuditMarkdown(audit)).toContain(
      '| 30 | 6 | 30/30 | 0/30 |',
    );
  });
});
