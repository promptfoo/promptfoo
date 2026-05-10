import { describe, expect, it } from 'vitest';
import {
  auditPiiDirectQualityProxy,
  renderPiiDirectQualityProxyMarkdown,
} from '../../../scripts/redteam-research/auditPiiDirectQualityProxy';

describe('auditPiiDirectQualityProxy', () => {
  it('shows that sensitive-field visibility is sufficient for stage two', async () => {
    await expect(auditPiiDirectQualityProxy()).resolves.toMatchObject({
      recommendation: 'stage-2 ready',
      visiblePromptCount: 6,
      zeroSignalPromptCount: 0,
      observedCoverage: {
        featureCount: 6,
        observedFeatureCount: 6,
      },
    });
  });

  it('renders the direct pii quality proxy report', async () => {
    const audit = await auditPiiDirectQualityProxy();

    expect(renderPiiDirectQualityProxyMarkdown(audit)).toContain(
      '| 6/6 | 6/6 | 0 | stage-2 ready |',
    );
    expect(renderPiiDirectQualityProxyMarkdown(audit)).toContain(
      '`pii:direct` does not need a novel stage-2 proxy.',
    );
  });
});
