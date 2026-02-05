import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DebuggingPanel } from './DebuggingPanel';

vi.mock('../../../components/traces/TraceView', () => ({
  default: ({
    evaluationId,
    testCaseId,
    testIndex,
    promptIndex,
  }: {
    evaluationId?: string;
    testCaseId?: string;
    testIndex?: number;
    promptIndex?: number;
  }) => (
    <div data-testid="mock-trace-view">
      <span>Evaluation ID: {evaluationId}</span>
      <span>Test Case ID: {testCaseId}</span>
      <span>Test Index: {testIndex}</span>
      <span>Prompt Index: {promptIndex}</span>
    </div>
  ),
}));

describe('DebuggingPanel', () => {
  it('should render the Trace Timeline header and TraceView when evaluationId is provided', () => {
    const props = {
      evaluationId: 'eval-123',
      testCaseId: 'test-456',
      testIndex: 1,
      promptIndex: 0,
    };

    render(<DebuggingPanel {...props} />);

    expect(screen.getByText('Trace Timeline')).toBeInTheDocument();

    const traceView = screen.getByTestId('mock-trace-view');
    expect(traceView).toBeInTheDocument();

    expect(screen.getByText('Evaluation ID: eval-123')).toBeInTheDocument();
    expect(screen.getByText('Test Case ID: test-456')).toBeInTheDocument();
    expect(screen.getByText('Test Index: 1')).toBeInTheDocument();
    expect(screen.getByText('Prompt Index: 0')).toBeInTheDocument();
  });

  it('should not render anything when evaluationId is not provided', () => {
    const props = {
      testCaseId: 'test-456',
      testIndex: 1,
      promptIndex: 0,
    };

    render(<DebuggingPanel {...props} />);

    expect(screen.queryByText('Trace Timeline')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-trace-view')).not.toBeInTheDocument();
  });

  it('should always show TraceView when evaluationId exists (no display gating)', () => {
    const props = {
      evaluationId: 'eval-123',
      testCaseId: 'test-456',
      testIndex: 2,
      promptIndex: 1,
    };

    render(<DebuggingPanel {...props} />);

    const traceTimelineElement = screen.getByText('Trace Timeline');
    expect(traceTimelineElement).toBeInTheDocument();

    const traceViewElement = screen.getByTestId('mock-trace-view');
    expect(traceViewElement).toBeInTheDocument();

    // Check that the parent container does not have display: none
    const parentContainer = traceTimelineElement.parentElement;
    expect(parentContainer).not.toHaveStyle('display: none');
  });
});
