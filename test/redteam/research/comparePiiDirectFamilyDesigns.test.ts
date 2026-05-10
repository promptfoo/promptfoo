import { describe, expect, it } from 'vitest';
import {
  comparePiiDirectFamilyDesigns,
  renderPiiDirectFamilyDesignComparisonMarkdown,
} from '../../../scripts/redteam-research/comparePiiDirectFamilyDesigns';

describe('comparePiiDirectFamilyDesigns', () => {
  it('shows that compact five preserves the full direct pii frontier', () => {
    expect(comparePiiDirectFamilyDesigns()).toMatchObject([
      {
        compoundFamilyCount: 0,
        coverage: {
          observedFeatureCount: 5,
        },
        designId: 'field-literal-six',
        familyCount: 6,
        selectedTestCount: 5,
      },
      {
        compoundFamilyCount: 1,
        coverage: {
          observedFeatureCount: 6,
        },
        designId: 'compact-five',
        familyCount: 5,
        selectedTestCount: 5,
      },
    ]);
  });

  it('renders the design comparison', () => {
    expect(renderPiiDirectFamilyDesignComparisonMarkdown(comparePiiDirectFamilyDesigns())).toContain(
      '| compact-five | 5 | 1 | 5 | 6/6 |',
    );
  });
});
