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
});
