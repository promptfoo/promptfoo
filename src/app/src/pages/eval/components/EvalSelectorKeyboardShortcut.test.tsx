import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  const openShortcut = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.keyboard('{Control>}k{/Control}');
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each([
    { name: 'Ctrl+K', keys: '{Control>}k{/Control}' },
    { name: 'Cmd+K', keys: '{Meta>}k{/Meta}' },
  ])('when user presses $name', ({ keys }) => {
    it('should open the EvalSelectorDialog', async () => {
      const user = userEvent.setup();
      render(<EvalSelector onEvalSelected={mockOnEvalSelected} />);

      expect(screen.queryByTestId('eval-selector-dialog')).not.toBeInTheDocument();

      await user.keyboard(keys);

      expect(screen.getByTestId('eval-selector-dialog')).toBeInTheDocument();
      expect(screen.getByText('Eval Selector Dialog')).toBeInTheDocument();
    });
  });

  it('should not open multiple dialogs if the shortcut is pressed while the dialog is already open', async () => {
    const user = userEvent.setup();
    render(<EvalSelector onEvalSelected={mockOnEvalSelected} />);

    await openShortcut(user);

    expect(screen.getByTestId('eval-selector-dialog')).toBeInTheDocument();

    await openShortcut(user);

    const dialogs = screen.getAllByTestId('eval-selector-dialog');
    expect(dialogs.length).toBe(1);
  });

  it('should call onEvalSelected with the correct evalId when an eval is selected in the EvalSelectorDialog', async () => {
    const user = userEvent.setup();
    render(<EvalSelector onEvalSelected={mockOnEvalSelected} />);

    await openShortcut(user);

    const selectEvalButton = screen.getByTestId('select-eval-button');
    await user.click(selectEvalButton);

    expect(mockOnEvalSelected).toHaveBeenCalledWith('test-eval-id');
  });

  it('should close the EvalSelectorDialog after an eval is selected', async () => {
    const user = userEvent.setup();
    render(<EvalSelector onEvalSelected={mockOnEvalSelected} />);

    await openShortcut(user);
    expect(screen.getByTestId('eval-selector-dialog')).toBeInTheDocument();

    await user.click(screen.getByTestId('select-eval-button'));

    expect(screen.queryByTestId('eval-selector-dialog')).not.toBeInTheDocument();
    expect(mockOnEvalSelected).toHaveBeenCalledWith('test-eval-id');
  });

  it('should close the EvalSelectorDialog when onClose is triggered', async () => {
    const user = userEvent.setup();
    render(<EvalSelector onEvalSelected={mockOnEvalSelected} />);

    await openShortcut(user);

    expect(screen.getByTestId('eval-selector-dialog')).toBeInTheDocument();

    await user.click(screen.getByTestId('close-dialog-button'));

    expect(screen.queryByTestId('eval-selector-dialog')).not.toBeInTheDocument();
  });
});
