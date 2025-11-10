import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalSelector from './EvalSelectorKeyboardShortcut';

vi.mock('./EvalSelectorDialog', () => ({
  default: vi.fn(({ open, onClose, onEvalSelected }) => {
    if (!open) {
      return null;
    }
    return (
      <div data-testid="eval-selector-dialog">
        Eval Selector Dialog
        <button data-testid="select-eval-button" onClick={() => onEvalSelected?.('test-eval-id')}>
          Select Eval
        </button>
        <button data-testid="close-dialog-button" onClick={onClose}>
          Close
        </button>
        <button data-testid="close-button" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }),
}));

describe('EvalSelector', () => {
  const mockOnEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each([
    { name: 'Ctrl+K', event: { key: 'k', ctrlKey: true } },
    { name: 'Cmd+K', event: { key: 'k', metaKey: true } },
  ])('when user presses $name', ({ event }) => {
    it('should open the EvalSelectorDialog', () => {
      render(<EvalSelector onEvalSelected={mockOnEvalSelected} />);

      expect(screen.queryByTestId('eval-selector-dialog')).not.toBeInTheDocument();

      fireEvent.keyDown(window, event);

      expect(screen.getByTestId('eval-selector-dialog')).toBeInTheDocument();
      expect(screen.getByText('Eval Selector Dialog')).toBeInTheDocument();
    });
  });

  it('should not open multiple dialogs if the shortcut is pressed while the dialog is already open', () => {
    render(<EvalSelector onEvalSelected={mockOnEvalSelected} />);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(screen.getByTestId('eval-selector-dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    const dialogs = screen.getAllByTestId('eval-selector-dialog');
    expect(dialogs.length).toBe(1);
  });

  it('should call onEvalSelected with the correct evalId when an eval is selected in the EvalSelectorDialog', () => {
    render(<EvalSelector onEvalSelected={mockOnEvalSelected} />);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    const selectEvalButton = screen.getByTestId('select-eval-button');
    fireEvent.click(selectEvalButton);

    expect(mockOnEvalSelected).toHaveBeenCalledWith('test-eval-id');
  });

  it('should close the EvalSelectorDialog after an eval is selected', () => {
    render(<EvalSelector onEvalSelected={mockOnEvalSelected} />);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByTestId('eval-selector-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('select-eval-button'));

    expect(screen.queryByTestId('eval-selector-dialog')).not.toBeInTheDocument();
    expect(mockOnEvalSelected).toHaveBeenCalledWith('test-eval-id');
  });

  it('should close the EvalSelectorDialog when onClose is triggered', () => {
    render(<EvalSelector onEvalSelected={mockOnEvalSelected} />);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(screen.getByTestId('eval-selector-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('close-dialog-button'));

    expect(screen.queryByTestId('eval-selector-dialog')).not.toBeInTheDocument();
  });
});
