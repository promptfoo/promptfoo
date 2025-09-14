import { ThemeProvider, createTheme } from '@mui/material/styles';
import { act, render, screen, waitFor } from '@testing-library/react';
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

const theme = createTheme();

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

    render(
      <ThemeProvider theme={theme}>
        <LogViewer logs={logs} />
      </ThemeProvider>,
    );

    const logTextElement = screen.getByText(new RegExp(longLogLine));
    const logContainer = logTextElement.parentElement;

    expect(logContainer).toBeInTheDocument();

    expect(logContainer).toHaveStyle({ overflowX: 'auto' });

    if (logContainer) {
      expect(logContainer.scrollWidth).toBeGreaterThan(logContainer.clientWidth);
    }
  });

  // Test removed - width tracking was causing resize issues
  // The component now uses CSS width: 100% with overflow handling
  it.skip('should update width when the container width changes', async () => {
    const initialWidth = 500;
    const newWidth = 800;
    const logs = ['Log line 1', 'Log line 2'];
    let resizeObserverCallback: ResizeObserverCallback | null = null;
    let observedElement: Element | null = null;

    // Mock ResizeObserver to capture the callback and observed element
    global.ResizeObserver = vi.fn().mockImplementation((callback) => {
      resizeObserverCallback = callback;
      return {
        observe: vi.fn((element: Element) => {
          // Only capture the first observed element (not the dialog one)
          if (!observedElement) {
            observedElement = element;
          }
        }),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    });

    // Set initial width
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return initialWidth;
      },
    });

    // Mock getBoundingClientRect for width measurement
    HTMLElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      ...originalGetBoundingClientRect.call(document.body),
      width: initialWidth,
    });

    render(
      <ThemeProvider theme={theme}>
        <LogViewer logs={logs} />
      </ThemeProvider>,
    );

    // Get the first occurrence of "Log line 1" (not in the dialog)
    const logTextElements = screen.getAllByText(/Log line 1/);
    // Get the Paper element which has the width style (first one, not in dialog)
    const logContainer = logTextElements[0].closest('.MuiPaper-root');

    expect(logContainer).toBeInTheDocument();

    // Wait for initial width to be set
    await waitFor(() => {
      // Check the data attribute to verify the width is set
      expect(logContainer).toHaveAttribute('data-width', initialWidth.toString());
    });

    // Simulate width change - update the mock to return new width
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return newWidth;
      },
    });

    // Update getBoundingClientRect to return new width
    HTMLElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      ...originalGetBoundingClientRect.call(document.body),
      width: newWidth,
    });

    // If we have a specific observed element, update its clientWidth specifically
    if (observedElement) {
      Object.defineProperty(observedElement, 'clientWidth', {
        configurable: true,
        get() {
          return newWidth;
        },
      });
    }

    // Trigger the ResizeObserver callback
    await act(async () => {
      if (resizeObserverCallback && observedElement) {
        resizeObserverCallback(
          [
            {
              target: observedElement,
              contentRect: {} as DOMRectReadOnly,
              borderBoxSize: [] as ResizeObserverSize[],
              contentBoxSize: [] as ResizeObserverSize[],
              devicePixelContentBoxSize: [] as ResizeObserverSize[],
            },
          ],
          {} as ResizeObserver,
        );
      }
    });

    // Wait for the width to update
    await waitFor(() => {
      // Re-query for the element as it may have been re-rendered
      const updatedLogTextElements = screen.getAllByText(/Log line 1/);
      const updatedLogContainer = updatedLogTextElements[0].closest('.MuiPaper-root');
      // Check the data attribute to verify the width has updated
      expect(updatedLogContainer).toHaveAttribute('data-width', newWidth.toString());
    });
  });
});
