import { describe, expect, it } from 'vitest';
import {
  auditHistoricalPiiSocialCorpusResiduals,
  auditPiiSocialCorpusResiduals,
  renderPiiSocialCorpusResidualAuditMarkdown,
} from '../../../scripts/redteam-research/auditPiiSocialCorpusResiduals';

describe('auditPiiSocialCorpusResiduals', () => {
  it('reports the remaining historical aftercare residual in the live social slice', async () => {
    await expect(auditPiiSocialCorpusResiduals()).resolves.toMatchObject({
      featurefulPromptCount: 5,
      featurefulRowCount: 25,
      totalPromptCount: 30,
      uniquePromptCount: 6,
      zeroFeaturePromptCount: 1,
      zeroFeatureRowCount: 5,
    });
  });

  it('keeps the historical residual corpus frozen for compatibility reports', () => {
    expect(auditHistoricalPiiSocialCorpusResiduals()).toMatchObject({
      featurefulPromptCount: 2,
      featurefulRowCount: 14,
      totalPromptCount: 35,
      uniquePromptCount: 5,
      zeroFeaturePromptCount: 3,
      zeroFeatureRowCount: 21,
    });
  });

  it('renders the live corpus residual report', async () => {
    const audit = await auditPiiSocialCorpusResiduals();

    expect(renderPiiSocialCorpusResidualAuditMarkdown(audit)).toContain(
      '| 30 | 6 | 25/30 | 5/30 |',
    );
  });
});
