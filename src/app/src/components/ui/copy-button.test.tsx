import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './copy-button';

describe('CopyButton', () => {
  beforeEach(() => {
    // Set up a working clipboard API for most tests
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders copy button', () => {
    render(<CopyButton value="test text" />);
    const button = screen.getByRole('button', { name: 'Copy' });
    expect(button).toBeInTheDocument();
  });

  it('copies text to clipboard on click', async () => {
    const user = userEvent.setup();
    render(<CopyButton value="test text" />);
    const button = screen.getByRole('button', { name: 'Copy' });

    await user.click(button);

    // Verify the button changes to "Copied" state, indicating clipboard write succeeded
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });
  });

  it('shows check icon after successful copy', async () => {
    const user = userEvent.setup();
    const { container } = render(<CopyButton value="test text" />);
    const button = screen.getByRole('button', { name: 'Copy' });

    await user.click(button);

    const button2 = screen.getByRole('button', { name: 'Copied' });
    expect(button2).toBeInTheDocument();

    const checkIcon = container.querySelector('svg');
    expect(checkIcon).toBeInTheDocument();
  });

  it('reverts to copy icon after 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CopyButton value="test text" />);
    const button = screen.getByRole('button', { name: 'Copy' });

    await user.click(button);

    // Verify the copied state appears
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    // Fast-forward 2 seconds and let React process state updates
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Button should revert to "Copy"
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('applies custom className', () => {
    render(<CopyButton value="test" className="custom-copy-button" />);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-copy-button');
  });

  it('supports custom icon size', () => {
    const { container } = render(<CopyButton value="test" iconSize="h-6 w-6" />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('h-6', 'w-6');
  });

  it('handles rapid clicks by clearing previous timeouts', async () => {
    const user = userEvent.setup();
    render(<CopyButton value="test text" />);
    const button = screen.getByRole('button', { name: 'Copy' });

    await user.click(button);
    await user.click(button);
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
      },
      { timeout: 2500 },
    );
  });

  it('clears copy timeout on unmount if copy operation was triggered', async () => {
    const user = userEvent.setup();
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const { unmount } = render(<CopyButton value="test text" />);
    const button = screen.getByRole('button', { name: 'Copy' });

    await user.click(button);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
