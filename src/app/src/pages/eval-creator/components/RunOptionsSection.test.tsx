import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RunOptionsSection } from './RunOptionsSection';

import type { SetupReadiness } from './setupReadiness';

vi.mock('./RunTestSuiteButton', () => ({
  default: ({ disabledReason }: { disabledReason?: string }) => (
    <>
      <button type="button" disabled={Boolean(disabledReason)}>
        Run Evaluation
      </button>
      {disabledReason && <p>{disabledReason}</p>}
    </>
  ),
}));

const readySetup: SetupReadiness = {
  isReadyToRun: true,
  issues: [],
  providerCount: 2,
  promptCount: 1,
  testCount: 3,
  requiredVariables: [],
  testCasesMissingVariables: [],
  testCasesMissingAssertionVariables: [],
  testCasesWithInvalidAssertions: [],
  defaultTestHasInvalidAssertions: false,
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

  it('keeps an invalid fractional delay visible and blocks launching until it is corrected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RunOptionsSection readiness={readySetup} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Optional run settings/i }));
    const delayInput = screen.getByLabelText('Delay between calls (ms)');
    await user.click(delayInput);
    await user.paste('1.5');

    expect(delayInput).toHaveValue(1.5);
    expect(delayInput).toHaveAttribute('aria-invalid', 'true');
    expect(delayInput).toHaveAccessibleDescription(
      'Enter a whole number of milliseconds, 0 or greater.',
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Run Evaluation' })).toBeDisabled();
    expect(screen.getByText('Fix invalid optional run settings before starting.')).toBeVisible();
  });

  it('requires a whole positive maximum concurrency value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RunOptionsSection readiness={readySetup} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Optional run settings/i }));
    const concurrencyInput = screen.getByLabelText('Maximum concurrent requests');
    await user.click(concurrencyInput);
    await user.paste('2.5');

    expect(concurrencyInput).toHaveAttribute('aria-invalid', 'true');
    expect(concurrencyInput).toHaveAccessibleDescription(
      'Enter a whole number of concurrent requests, 1 or greater.',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stores a valid delay and sets serial execution explicitly', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RunOptionsSection readiness={readySetup} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Optional run settings/i }));
    await user.type(screen.getByLabelText('Delay between calls (ms)'), '250');

    expect(onChange).toHaveBeenLastCalledWith({
      description: undefined,
      delay: 250,
      maxConcurrency: 1,
    });
  });
});
