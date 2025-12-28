import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SuggestionsDialog from './SuggestionsDialog';
import type { GradingResult } from '@promptfoo/types';

function renderSuggestionsDialog(props: {
  open?: boolean;
  onClose?: () => void;
  gradingResult?: any;
}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    gradingResult: undefined,
  };

  const mergedProps = { ...defaultProps, ...props };

  return render(<SuggestionsDialog {...mergedProps} />);
}

describe('SuggestionsDialog', () => {
  it("should render the dialog with the title 'Suggestions' and a close button when 'open' is true", () => {
    const handleClose = vi.fn();
    renderSuggestionsDialog({ onClose: handleClose });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Suggestions' })).toBeInTheDocument();

    // Dialog has built-in close button with sr-only "Close" text
    const closeButton = screen.getByRole('button', { name: 'Close' });
    expect(closeButton).toBeInTheDocument();
  });

  it('should render with no suggestion cards when gradingResult is undefined', () => {
    renderSuggestionsDialog({});

    expect(screen.queryByRole('card')).toBeNull();
  });

  it("should display the suggestion value as body text when suggestion.action is 'note'", () => {
    const gradingResult: GradingResult = {
      score: 0,
      pass: false,
      suggestions: [
        {
          action: 'note',
          value: 'This is a recommendation note.',
          type: 'llm',
        },
      ],
      reason: 'dummy reason',
    };

    renderSuggestionsDialog({ gradingResult });

    expect(screen.getByText('This is a recommendation note.')).toBeInTheDocument();
  });

  it('should call onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderSuggestionsDialog({ onClose });

    // Dialog has built-in close button with sr-only "Close" text
    const closeButton = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should handle a gradingResult with componentResults that have undefined suggestions property', () => {
    const gradingResult = {
      componentResults: [
        {
          suggestions: undefined,
          pass: true,
          score: 1,
          reason: '',
        },
      ],
      pass: true,
      score: 1,
      reason: '',
    };

    renderSuggestionsDialog({ gradingResult });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('should handle suggestions with unknown or undefined type properties gracefully', () => {
    const gradingResult = {
      suggestions: [
        {
          action: 'note' as 'note',
          value: 'This is a suggestion with an undefined type.',
          type: '',
        },
      ],
      pass: false,
      score: 0,
      reason: 'No reason provided',
    };

    renderSuggestionsDialog({ gradingResult });

    const suggestionText = screen.getByText('This is a suggestion with an undefined type.');
    expect(suggestionText).toBeInTheDocument();

    expect(screen.queryByText(/This suggestion uses a technique/)).toBeNull();
  });

  it('should show copy button when suggestion is expanded', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(global.navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
    });

    const mockGradingResult: GradingResult = {
      score: 1,
      pass: true,
      suggestions: [
        {
          type: 'prompt',
          action: 'replace-prompt',
          value: 'This is a suggested prompt.',
        },
      ],
      reason: 'Test reason',
    };

    renderSuggestionsDialog({ gradingResult: mockGradingResult });

    const accordionSummary = screen.getByText('View suggested prompt');
    fireEvent.click(accordionSummary);

    // Wait for content to appear
    await waitFor(() => {
      expect(screen.getByText('This is a suggested prompt.')).toBeInTheDocument();
    });

    // Copy button uses Lucide Copy icon with class lucide-copy
    const copyIcon = document.querySelector('.lucide-copy');
    expect(copyIcon).toBeInTheDocument();

    // Click the copy button
    const copyButton = copyIcon?.closest('button') as HTMLButtonElement;
    fireEvent.click(copyButton);

    // Verify clipboard was called
    expect(mockWriteText).toHaveBeenCalledWith('This is a suggested prompt.');
  });

  it('should handle navigator.clipboard.writeText failure gracefully', async () => {
    const mockWriteText = vi.fn().mockRejectedValue(new Error('Clipboard write failed'));

    Object.defineProperty(global.navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
    });

    const gradingResult: GradingResult = {
      score: 0,
      pass: false,
      suggestions: [{ action: 'replace-prompt', value: 'Suggested prompt', type: 'prompt' }],
      reason: 'dummy reason',
    };

    renderSuggestionsDialog({ gradingResult });

    await screen.findByText('View suggested prompt');

    expect(screen.getByText('View suggested prompt')).toBeInTheDocument();
  });
});
