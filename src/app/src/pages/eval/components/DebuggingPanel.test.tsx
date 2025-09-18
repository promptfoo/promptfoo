import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DebuggingPanel } from './DebuggingPanel';

vi.mock('../../../components/traces/TraceView', () => ({
  default: ({ evaluationId, testCaseId }: { evaluationId?: string; testCaseId?: string }) => (
    <div data-testid="mock-trace-view">
      <span>Evaluation ID: {evaluationId}</span>
      <span>Test Case ID: {testCaseId}</span>
    </div>
  ),
}));

describe('DebuggingPanel', () => {
  it('should render the Trace Timeline header and TraceView when evaluationId is provided and showTraceSection is true', () => {
    const props = {
      evaluationId: 'eval-123',
      testCaseId: 'test-456',
      showTraceSection: true,
      onTraceSectionVisibilityChange: vi.fn(),
    };

    render(<DebuggingPanel {...props} />);

    expect(screen.getByText('Trace Timeline')).toBeInTheDocument();

    const traceView = screen.getByTestId('mock-trace-view');
    expect(traceView).toBeInTheDocument();

    expect(screen.getByText('Evaluation ID: eval-123')).toBeInTheDocument();
    expect(screen.getByText('Test Case ID: test-456')).toBeInTheDocument();
  });

  it('should not render the trace section when showTraceSection is false, even if evaluationId is provided', () => {
    const props = {
      evaluationId: 'eval-123',
      testCaseId: 'test-456',
      showTraceSection: false,
      onTraceSectionVisibilityChange: vi.fn(),
    };

    render(<DebuggingPanel {...props} />);

    const traceTimelineElement = screen.queryByText('Trace Timeline');
    expect(traceTimelineElement).toBeInTheDocument();

    const traceViewElement = screen.queryByTestId('mock-trace-view');
    expect(traceViewElement).toBeInTheDocument();

    // Check that the parent container (the Box with mb={2}) has display: none
    const parentContainer = traceTimelineElement?.parentElement;
    expect(parentContainer).toHaveStyle('display: none');
  });
});
