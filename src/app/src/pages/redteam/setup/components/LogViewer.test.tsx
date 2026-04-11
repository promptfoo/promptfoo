import { mockClipboard } from '@app/tests/browserMocks';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogViewer } from './LogViewer';

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

describe('LogViewer', () => {
  beforeEach(() => {
    mockClipboard();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should wrap long log lines instead of forcing horizontal overflow', () => {
    const longLogLine =
      'this_is_a_very_long_log_line_that_should_definitely_overflow_the_container_'.repeat(10);
    const logs = ['A normal log line.', longLogLine, 'Another normal log line.'];

    const { container } = render(<LogViewer logs={logs} />);

    const logTextElement = screen.getByText(new RegExp(longLogLine));
    const logContent = logTextElement.closest('div');
    const logContainerOuter = container.querySelector('.overflow-y-auto');

    expect(logContainerOuter).toBeInTheDocument();
    expect(logTextElement).toBeInTheDocument();
    expect(logContainerOuter).toHaveClass('overflow-x-hidden');
    expect(logContent).toHaveClass('whitespace-pre-wrap');
    expect(logContent).toHaveClass('break-words');
    expect(logContent).not.toHaveClass('min-w-max');
  });
});
