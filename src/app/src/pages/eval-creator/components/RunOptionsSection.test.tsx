import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RunOptionsSection } from './RunOptionsSection';

import type { SetupReadiness } from './setupReadiness';

vi.mock('./RunTestSuiteButton', () => ({
  default: () => <button type="button">Run Eval</button>,
}));

const readySetup: SetupReadiness = {
  isReadyToRun: true,
  issues: [],
  providerCount: 2,
  promptCount: 1,
  testCount: 3,
  requiredVariables: [],
  testCasesMissingVariables: [],
  plannedBaseRequestCount: 6,
};

describe('RunOptionsSection', () => {
  it('shows a run summary and explains possible additional model calls', () => {
    render(<RunOptionsSection readiness={readySetup} onChange={vi.fn()} />);

    expect(screen.getByText('Review and run')).toBeInTheDocument();
    expect(screen.getByText(/starts with 6 base requests/)).toBeInTheDocument();
    expect(screen.getByText(/additional model calls and increase cost/)).toBeInTheDocument();
    expect(screen.getByText(/Required setup is complete/)).toBeInTheDocument();
  });

  it('keeps optional settings collapsed until users need them', async () => {
    const user = userEvent.setup();
    render(<RunOptionsSection readiness={readySetup} onChange={vi.fn()} />);

    expect(screen.queryByLabelText('Evaluation name or description')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Optional run settings/i }));

    expect(screen.getByLabelText('Evaluation name or description')).toBeInTheDocument();
    expect(screen.getByLabelText('Delay between calls (ms)')).toBeInTheDocument();
  });

  it('surfaces required corrections before running', () => {
    const incompleteSetup: SetupReadiness = {
      ...readySetup,
      isReadyToRun: false,
      issues: [
        {
          id: 'variables',
          message: 'Test case 1 is missing values required by your prompts.',
          stepId: 3,
        },
      ],
    };

    render(<RunOptionsSection readiness={incompleteSetup} onChange={vi.fn()} />);

    expect(screen.getByText('Complete these items before running:')).toBeInTheDocument();
    expect(
      screen.getByText('Test case 1 is missing values required by your prompts.'),
    ).toBeInTheDocument();
  });
});
