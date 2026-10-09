import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodexSecurityQualityStatus } from './CodexSecurityQualityStatus';

describe('CodexSecurityQualityStatus', () => {
  it.each([undefined, null, {}, 'not-scored', { status: 'scored', curatedRecall: 0 }])(
    'does not infer unscored quality from a failed assertion or unrelated metadata: %j',
    (quality) => {
      render(
        <CodexSecurityQualityStatus
          gradingResults={[{ pass: false, score: 0, reason: 'Failed', metadata: { quality } }]}
        />,
      );
      expect(screen.queryByText('Quality: Not scored')).not.toBeInTheDocument();
    },
  );

  it('finds explicit eligibility failures in nested assertion sets and deduplicates reasons', () => {
    const unscored = {
      pass: false,
      score: 0,
      reason: 'Not scored',
      metadata: { quality: { status: 'not-scored', reason: '<b>Evidence is missing</b>' } },
    };
    const { container } = render(
      <CodexSecurityQualityStatus
        gradingResults={[
          {
            pass: false,
            score: 0,
            reason: 'Assertion set failed',
            componentResults: [{ ...unscored, componentResults: [unscored] }],
          },
        ]}
      />,
    );
    expect(screen.getByText('Quality: Not scored')).toBeInTheDocument();
    expect(screen.getAllByText('<b>Evidence is missing</b>')).toHaveLength(1);
    expect(container.querySelector('b')).toBeNull();
  });
});
