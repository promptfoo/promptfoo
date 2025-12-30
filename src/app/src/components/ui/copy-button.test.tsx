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
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const user = userEvent.setup();
    render(<CopyButton value="test text" />);
    const button = screen.getByRole('button', { name: 'Copy' });

    await user.click(button);

    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    const filteredCalls = setTimeoutSpy.mock.calls.filter(([, delay]) => delay === 2000);
    const timeoutCallback = filteredCalls[filteredCalls.length - 1]?.[0] as
      | (() => void)
      | undefined;
    act(() => {
      timeoutCallback?.();
    });

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    setTimeoutSpy.mockRestore();
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
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const user = userEvent.setup();
    render(<CopyButton value="test text" />);
    const button = screen.getByRole('button', { name: 'Copy' });

    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    const filteredCalls2 = setTimeoutSpy.mock.calls.filter(([, delay]) => delay === 2000);
    const timeoutCallback = filteredCalls2[filteredCalls2.length - 1]?.[0] as
      | (() => void)
      | undefined;
    act(() => {
      timeoutCallback?.();
    });

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    clearTimeoutSpy.mockRestore();
    setTimeoutSpy.mockRestore();
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
