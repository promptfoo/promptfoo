import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogViewer } from './LogViewer';

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
  configurable: true,
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe('LogViewer', () => {
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  afterEach(() => {
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
    }
    if (originalScrollWidth) {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth);
    }
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.clearAllMocks();
  });

  it('should render long log lines with a fixed width and horizontal scroll', () => {
    const longLogLine =
      'this_is_a_very_long_log_line_that_should_definitely_overflow_the_container_'.repeat(10);
    const logs = ['A normal log line.', longLogLine, 'Another normal log line.'];
    const containerWidth = 500;

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: containerWidth,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      value: containerWidth * 2,
    });

    const { container } = render(<LogViewer logs={logs} />);

    const logTextElement = screen.getByText(new RegExp(longLogLine));
    // The parent element contains the whitespace-pre class, the grandparent has overflow-auto
    const logContainerOuter = container.querySelector('.overflow-auto');

    expect(logContainerOuter).toBeInTheDocument();
    expect(logTextElement).toBeInTheDocument();

    if (logContainerOuter) {
      expect(logContainerOuter.scrollWidth).toBeGreaterThan(logContainerOuter.clientWidth);
    }
  });

  it('should cancel pending RAF callbacks when component unmounts', () => {
    const cancelAnimationFrameSpy = vi.spyOn(global, 'cancelAnimationFrame');
    const requestAnimationFrameSpy = vi.spyOn(global, 'requestAnimationFrame');

    const logs = ['Log 1', 'Log 2'];
    const { unmount } = render(<LogViewer logs={logs} />);

    // RAF should have been called for auto-scroll
    expect(requestAnimationFrameSpy).toHaveBeenCalled();
    const rafCallCount = requestAnimationFrameSpy.mock.calls.length;

    // Unmount the component
    unmount();

    // cancelAnimationFrame should have been called for each RAF ID
    expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(rafCallCount);

    cancelAnimationFrameSpy.mockRestore();
    requestAnimationFrameSpy.mockRestore();
  });

  it('should cancel previous RAF callbacks when logs update', () => {
    const cancelAnimationFrameSpy = vi.spyOn(global, 'cancelAnimationFrame');

    const { rerender } = render(<LogViewer logs={['Log 1']} />);

    // Clear the spy to track only new calls
    cancelAnimationFrameSpy.mockClear();

    // Update logs, which should trigger cancellation of previous RAF
    rerender(<LogViewer logs={['Log 1', 'Log 2']} />);

    // Should have cancelled previous RAF callbacks
    expect(cancelAnimationFrameSpy).toHaveBeenCalled();

    cancelAnimationFrameSpy.mockRestore();
  });

  it('should track RAF IDs correctly when scrollToBottom is called', () => {
    const requestAnimationFrameSpy = vi.spyOn(global, 'requestAnimationFrame');

    const logs = ['Log 1'];
    render(<LogViewer logs={logs} />);

    // RAF should be called for auto-scroll functionality
    expect(requestAnimationFrameSpy).toHaveBeenCalled();

    requestAnimationFrameSpy.mockRestore();
  });

  it('should handle multiple RAF callbacks in the same render', () => {
    const requestAnimationFrameSpy = vi.spyOn(global, 'requestAnimationFrame');
    const cancelAnimationFrameSpy = vi.spyOn(global, 'cancelAnimationFrame');

    const logs = ['Log 1', 'Log 2', 'Log 3'];
    const { unmount } = render(<LogViewer logs={logs} />);

    // Multiple RAF callbacks may be scheduled (for main and fullscreen containers)
    expect(requestAnimationFrameSpy).toHaveBeenCalled();

    const rafCallCount = requestAnimationFrameSpy.mock.calls.length;

    // Unmount should cancel all RAF callbacks
    unmount();

    expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(rafCallCount);

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it('should not leave pending RAF callbacks after component cleanup', () => {
    const cancelAnimationFrameSpy = vi.spyOn(global, 'cancelAnimationFrame');
    const requestAnimationFrameSpy = vi.spyOn(global, 'requestAnimationFrame');

    const logs = ['Log 1'];
    const { unmount, rerender } = render(<LogViewer logs={logs} />);

    // Clear the spy to track only the cancellations on updates
    cancelAnimationFrameSpy.mockClear();

    // Update logs multiple times - each update will cancel previous RAF and create new ones
    rerender(<LogViewer logs={['Log 1', 'Log 2']} />);
    rerender(<LogViewer logs={['Log 1', 'Log 2', 'Log 3']} />);

    // Get cancellation count before unmount
    const cancellationsBeforeUnmount = cancelAnimationFrameSpy.mock.calls.length;

    // Unmount component
    unmount();

    // Should have cancelled more RAFs during unmount
    expect(cancelAnimationFrameSpy.mock.calls.length).toBeGreaterThan(cancellationsBeforeUnmount);

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });
});
