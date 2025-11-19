import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SuggestionsDialog from './SuggestionsDialog';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { GradingResult } from '@promptfoo/types';

const theme = createTheme();

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

  return render(
    <ThemeProvider theme={theme}>
      <SuggestionsDialog {...mergedProps} />
    </ThemeProvider>,
  );
}

describe('SuggestionsDialog', () => {
  it("should render the dialog with the title 'Suggestions' and a close button when 'open' is true", () => {
    const handleClose = vi.fn();
    renderSuggestionsDialog({ onClose: handleClose });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Suggestions' })).toBeInTheDocument();

    expect(screen.getByLabelText('close')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
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

  it('should call onClose when the close button or the "Close" dialog action button is clicked', () => {
    const onClose = vi.fn();
    renderSuggestionsDialog({ onClose });

    const closeIconButton = screen.getByLabelText('close');
    fireEvent.click(closeIconButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    const closeActionButton = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeActionButton);
    expect(onClose).toHaveBeenCalledTimes(2);
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

  it("should display 'Copied!' message when copy button is clicked for a suggestion", async () => {
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

    await screen.findByRole('region');

    const copyIcon = screen.getByTestId('ContentCopyIcon');
    const copyButton = copyIcon.closest('button') as HTMLButtonElement;

    copyButton.style.display = 'block';

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
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
