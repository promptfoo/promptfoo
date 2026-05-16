import type { ComponentProps } from 'react';

import { restoreTestTimers, useTestTimers } from '@app/tests/timers';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenerationProgressDialog } from './GenerationProgressDialog';

afterEach(() => {
  restoreTestTimers();
});

function renderDialog(props: Partial<ComponentProps<typeof GenerationProgressDialog>> = {}) {
  return render(
    <GenerationProgressDialog
      open={true}
      onCancel={vi.fn()}
      title="Generating Test Cases..."
      description="Creating diverse test cases."
      progress={1}
      total={4}
      phase="Generating personas"
      status="in-progress"
      {...props}
    />,
  );
}

describe('GenerationProgressDialog', () => {
  it('tracks elapsed time, computes progress, and allows cancellation', async () => {
    const timers = useTestTimers();
    const onCancel = vi.fn();
    renderDialog({ onCancel });

    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('0:00')).toBeInTheDocument();

    act(() => {
      timers.advanceBy(1000);
    });
    expect(screen.getByText('0:01')).toBeInTheDocument();

    timers.restore();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Initializing', 'Initializing'],
    ['Extracting concepts', 'Analyzing prompts'],
    ['Generating personas', 'Generating personas'],
    ['Generating edge cases', 'Generating edge cases'],
    ['Measuring diversity', 'Measuring diversity'],
    ['Generating assertions', 'Generating assertions'],
  ])('infers phase details for "%s"', (phase, expectedText) => {
    renderDialog({ phase });

    expect(screen.getAllByText(expectedText).length).toBeGreaterThan(0);
  });

  it('renders completed external phases, timestamps, streamed previews, and errors', () => {
    renderDialog({
      status: 'complete',
      progress: 4,
      total: 4,
      phase: 'Done',
      error: 'partial streaming failure',
      showLivePreview: true,
      streamedTestCases: [{ city: 'Paris', language: 'fr', audience: 'ops' }],
      streamedAssertions: [{ type: 'contains', value: 'Paris' }],
      phases: [
        { id: 'complete', label: 'Complete step', status: 'complete', timestamp: 65 },
        { id: 'active', label: 'Active step', status: 'in-progress' },
        { id: 'broken', label: 'Broken step', status: 'error' },
        { id: 'waiting', label: 'Waiting step', status: 'pending' },
      ],
    });

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByText(/Live Preview \(2 items\)/)).toBeInTheDocument();
    expect(screen.getByText(/city: Paris \| language: fr/)).toBeInTheDocument();
    expect(screen.getByText(/Assertion/)).toBeInTheDocument();
    expect(screen.getByText(/contains: Paris\.\.\./)).toBeInTheDocument();
    expect(screen.getByText('partial streaming failure')).toBeInTheDocument();
    expect(screen.getByText('Complete step')).toBeInTheDocument();
    expect(screen.getByText('Active step')).toBeInTheDocument();
    expect(screen.getByText('Broken step')).toBeInTheDocument();
    expect(screen.getByText('Waiting step')).toBeInTheDocument();
  });

  it('handles zero-total progress without rendering a live preview panel', () => {
    renderDialog({
      progress: 0,
      total: 0,
      phase: '',
      status: 'pending',
      showLivePreview: false,
    });

    expect(screen.getByText('Starting...')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.queryByText(/Live Preview/)).not.toBeInTheDocument();
  });
});
