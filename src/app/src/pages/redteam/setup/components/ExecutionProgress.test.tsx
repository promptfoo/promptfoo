import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ExecutionProgress } from './execution-progress';
import type { JobMetrics, JobError, JobCompletionSummary } from '@promptfoo/types';

// Mock theme provider wrapper
const theme = createTheme();

function renderWithTheme(component: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
}

describe('ExecutionProgress', () => {
  const defaultProps = {
    progress: 0,
    total: 0,
    status: 'idle' as const,
    startedAt: null,
    logs: [],
    logsExpanded: false,
    onToggleLogs: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('rendering states', () => {
    it('should not render when status is idle', () => {
      const { container } = renderWithTheme(<ExecutionProgress {...defaultProps} />);
      expect(container.firstChild).toBeNull();
    });

    it('should render when status is in-progress', () => {
      renderWithTheme(
        <ExecutionProgress {...defaultProps} status="in-progress" startedAt={Date.now()} />,
      );
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should render when status is complete', () => {
      renderWithTheme(
        <ExecutionProgress {...defaultProps} status="complete" startedAt={Date.now()} />,
      );
      expect(screen.getByText('Evaluation complete')).toBeInTheDocument();
    });

    it('should render when status is error', () => {
      renderWithTheme(
        <ExecutionProgress {...defaultProps} status="error" startedAt={Date.now()} />,
      );
      expect(screen.getByText('Evaluation failed')).toBeInTheDocument();
    });
  });

  describe('progress display', () => {
    it('should show indeterminate progress during generating phase', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          phase="generating"
          startedAt={Date.now()}
        />,
      );
      const progressBar = screen.getByRole('progressbar');
      // Indeterminate progress bars don't have aria-valuenow
      expect(progressBar).not.toHaveAttribute('aria-valuenow');
    });

    it('should show determinate progress during evaluating phase', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          phase="evaluating"
          progress={5}
          total={10}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('5/10 (50%)')).toBeInTheDocument();
    });

    it('should show correct percentage calculation', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          phase="evaluating"
          progress={3}
          total={12}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('3/12 (25%)')).toBeInTheDocument();
    });
  });

  describe('phase detail display', () => {
    it('should display phaseDetail when provided', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          phaseDetail="Generating pii tests..."
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('Generating pii tests...')).toBeInTheDocument();
    });

    it('should display default status text when no phaseDetail', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          phase="generating"
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('Generating test cases...')).toBeInTheDocument();
    });

    it('should display phase chip during in-progress', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          phase="evaluating"
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('evaluating')).toBeInTheDocument();
    });
  });

  describe('elapsed time', () => {
    it('should display elapsed time when running', () => {
      const startedAt = Date.now() - 65000; // 65 seconds ago
      renderWithTheme(
        <ExecutionProgress {...defaultProps} status="in-progress" startedAt={startedAt} />,
      );
      expect(screen.getByText('1m 5s')).toBeInTheDocument();
    });

    it('should freeze elapsed time on completion', () => {
      const startedAt = Date.now() - 120000; // 2 minutes ago
      renderWithTheme(
        <ExecutionProgress {...defaultProps} status="complete" startedAt={startedAt} />,
      );
      expect(screen.getByText('2m 0s')).toBeInTheDocument();
    });
  });

  describe('metrics display', () => {
    const metrics: JobMetrics = {
      testPassCount: 10,
      testFailCount: 3,
      testErrorCount: 1,
      tokenUsage: {
        total: 5000,
        prompt: 3000,
        completion: 2000,
        numRequests: 14,
      },
      totalLatencyMs: 28000,
    };

    it('should display results panel with pass/fail/error counts', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          metrics={metrics}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('should display resources panel with token usage', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          metrics={metrics}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('14')).toBeInTheDocument(); // requests
      expect(screen.getByText('5.0k')).toBeInTheDocument(); // tokens (formatNumber produces 5.0k)
      expect(screen.getByText(/2\.0.*s/)).toBeInTheDocument(); // avg latency
    });

    it('should not display resources panel when no requests', () => {
      const emptyMetrics: JobMetrics = {
        ...metrics,
        tokenUsage: { total: 0, prompt: 0, completion: 0, numRequests: 0 },
      };
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          metrics={emptyMetrics}
          startedAt={Date.now()}
        />,
      );
      expect(screen.queryByText('Requests')).not.toBeInTheDocument();
    });

    it('should show vulnerability count for failed tests', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          metrics={metrics}
          startedAt={Date.now()}
        />,
      );
      // Check for the fail count (3) and the Vuln label in the results panel
      // Percentage is 3/(10+3+1) = 3/14 = 21%
      expect(screen.getByText('3')).toBeInTheDocument();
      // Vuln label is shown with percentage in parentheses
      expect(screen.getByText(/Vuln \(21%\)/)).toBeInTheDocument();
    });
  });

  describe('errors display', () => {
    const errors: JobError[] = [
      { type: 'rate_limit', message: 'Rate limit exceeded', timestamp: Date.now(), count: 5 },
      { type: 'timeout', message: 'Request timed out', timestamp: Date.now(), count: 2 },
    ];

    it('should display errors panel when errors exist', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          errors={errors}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('Errors (7)')).toBeInTheDocument();
    });

    it('should display error types as chips', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          errors={errors}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('rate limit')).toBeInTheDocument();
      expect(screen.getByText('timeout')).toBeInTheDocument();
    });

    it('should display error counts when greater than 1', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          errors={errors}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('×5')).toBeInTheDocument();
      expect(screen.getByText('×2')).toBeInTheDocument();
    });

    it('should not display errors panel when no errors', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          errors={[]}
          startedAt={Date.now()}
        />,
      );
      expect(screen.queryByText(/Errors/)).not.toBeInTheDocument();
    });
  });

  describe('completion summary', () => {
    const summary: JobCompletionSummary = {
      vulnerabilitiesFound: 5,
      topCategories: [
        { name: 'pii', count: 3 },
        { name: 'jailbreak', count: 2 },
      ],
    };

    it('should display completion summary when complete', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="complete"
          summary={summary}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('5 vulnerabilities found')).toBeInTheDocument();
    });

    it('should display top categories', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="complete"
          summary={summary}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('pii (3)')).toBeInTheDocument();
      expect(screen.getByText('jailbreak (2)')).toBeInTheDocument();
    });

    it('should display success message when no vulnerabilities', () => {
      const noVulnSummary: JobCompletionSummary = {
        vulnerabilitiesFound: 0,
        topCategories: [],
      };
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="complete"
          summary={noVulnSummary}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('No vulnerabilities found')).toBeInTheDocument();
    });

    it('should display View Full Report link when evalId is provided', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="complete"
          summary={summary}
          evalId="test-eval-123"
          startedAt={Date.now()}
        />,
      );
      const link = screen.getByText('View Full Report →');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', '/reports?evalId=test-eval-123');
    });
  });

  describe('logs toggle', () => {
    it('should display logs toggle when logs exist', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          logs={['Log line 1', 'Log line 2']}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('Show logs (2 lines)')).toBeInTheDocument();
    });

    it('should call onToggleLogs when clicked', () => {
      const onToggleLogs = vi.fn();
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          logs={['Log line 1']}
          onToggleLogs={onToggleLogs}
          startedAt={Date.now()}
        />,
      );
      fireEvent.click(screen.getByText('Show logs (1 lines)'));
      expect(onToggleLogs).toHaveBeenCalled();
    });

    it('should show "Hide logs" when expanded', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          logs={['Log line 1']}
          logsExpanded={true}
          startedAt={Date.now()}
        />,
      );
      expect(screen.getByText('Hide logs (1 lines)')).toBeInTheDocument();
    });

    it('should render children (LogViewer) when logs expanded', () => {
      renderWithTheme(
        <ExecutionProgress
          {...defaultProps}
          status="in-progress"
          logs={['Log line 1']}
          logsExpanded={true}
          startedAt={Date.now()}
        >
          <div data-testid="log-viewer">Log Viewer Content</div>
        </ExecutionProgress>,
      );
      expect(screen.getByTestId('log-viewer')).toBeInTheDocument();
    });
  });

  describe('icons', () => {
    it('should show check icon on completion', () => {
      renderWithTheme(
        <ExecutionProgress {...defaultProps} status="complete" startedAt={Date.now()} />,
      );
      expect(screen.getByTestId('CheckCircleIcon')).toBeInTheDocument();
    });

    it('should show error icon on error', () => {
      renderWithTheme(
        <ExecutionProgress {...defaultProps} status="error" startedAt={Date.now()} />,
      );
      expect(screen.getByTestId('ErrorIcon')).toBeInTheDocument();
    });
  });
});
