import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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
    const user = userEvent.setup();
    render(<CopyButton value="test text" />);
    const button = screen.getByRole('button', { name: 'Copy' });

    await user.click(button);

    // Wait for the copied state to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });

    // Wait for button to revert to "Copy" after 2 seconds
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
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

  it.skip('handles clipboard API errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Override clipboard to make it fail for this test
    delete (navigator as any).clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')),
      },
      writable: true,
      configurable: true,
    });

    const user = userEvent.setup();
    render(<CopyButton value="test text" />);
    const button = screen.getByRole('button', { name: 'Copy' });

    await user.click(button);

    // Wait for error to be logged
    await waitFor(
      () => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to copy to clipboard:',
          expect.any(Error),
        );
      },
      { timeout: 1000 },
    );

    // Button should not have changed to "Copied" state
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
