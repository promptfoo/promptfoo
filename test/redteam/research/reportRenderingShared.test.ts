import { describe, expect, it } from 'vitest';
import {
  formatBandCoverage,
  renderMarkdownTable,
  renderNumberedSection,
} from '../../../scripts/redteam-research/reportRenderingShared';

describe('reportRenderingShared', () => {
  it('renders reusable markdown fragments for semantic reports', () => {
    expect(
      formatBandCoverage({
        coverageRate: 0.5,
        featureCount: 4,
        observedFeatureCount: 2,
        observedFeatureIds: ['a', 'b'],
        pluginId: 'example',
        promptCount: 5,
        promptsWithFeaturesCount: 3,
      }),
    ).toBe('2/4 features, 3/5 prompts');
    expect(
      renderMarkdownTable(['Portfolio', 'Band'], [{ cells: ['Baseline', '2/4'] }]),
    ).toEqual(['| Portfolio | Band |', '| --- | ---: |', '| Baseline | 2/4 |']);
    expect(renderNumberedSection('Examples', ['one', 'two'])).toEqual([
      '',
      '## Examples',
      '',
      '1. one',
      '2. two',
    ]);
  });
});
