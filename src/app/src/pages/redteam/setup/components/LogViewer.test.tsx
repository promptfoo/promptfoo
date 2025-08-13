import { ThemeProvider, createTheme } from '@mui/material/styles';
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

const theme = createTheme();

describe('LogViewer', () => {
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');

  afterEach(() => {
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
    }
    if (originalScrollWidth) {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth);
    }
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

    render(
      <ThemeProvider theme={theme}>
        <LogViewer logs={logs} />
      </ThemeProvider>,
    );

    const logTextElement = screen.getByText(new RegExp(longLogLine));
    const logContainer = logTextElement.parentElement;

    expect(logContainer).toBeInTheDocument();

    expect(logContainer).toHaveStyle({ overflowX: 'scroll' });

    if (logContainer) {
      expect(logContainer.scrollWidth).toBeGreaterThan(logContainer.clientWidth);
    }
  });

  // [Tusk] FAILING TEST
  it('should update width when the container width changes', () => {
    const initialWidth = 500;
    const newWidth = 800;
    const logs = ['Log line 1', 'Log line 2'];

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: initialWidth,
    });

    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <LogViewer logs={logs} />
      </ThemeProvider>,
    );

    const logTextElement = screen.getByText(/Log line 1/);
    const logContainer = logTextElement.parentElement;

    expect(logContainer).toBeInTheDocument();
    expect(logContainer).toHaveStyle(`width: ${initialWidth}px`);

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: newWidth,
    });

    rerender(
      <ThemeProvider theme={theme}>
        <LogViewer logs={logs} />
      </ThemeProvider>,
    );

    expect(logContainer).toHaveStyle(`width: ${newWidth}px`);
  });
});
