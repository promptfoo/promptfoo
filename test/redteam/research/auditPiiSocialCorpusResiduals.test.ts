import { describe, expect, it } from 'vitest';
import {
  auditPiiSocialCorpusResiduals,
  renderPiiSocialCorpusResidualAuditMarkdown,
} from '../../../scripts/redteam-research/auditPiiSocialCorpusResiduals';

describe('auditPiiSocialCorpusResiduals', () => {
  it('shows that most legacy social pii prompts still lack shared evidence', async () => {
    await expect(auditPiiSocialCorpusResiduals()).resolves.toMatchObject({
      featurefulPromptCount: 1,
      featurefulRowCount: 7,
      totalPromptCount: 35,
      uniquePromptCount: 5,
      zeroFeaturePromptCount: 4,
      zeroFeatureRowCount: 28,
    });
  });

  it('renders the corpus residual report', async () => {
    const audit = await auditPiiSocialCorpusResiduals();

    expect(renderPiiSocialCorpusResidualAuditMarkdown(audit)).toContain(
      '| 35 | 5 | 7/35 | 28/35 |',
    );
  });
});
