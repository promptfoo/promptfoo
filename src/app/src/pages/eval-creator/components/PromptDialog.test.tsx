import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PromptDialog from './PromptDialog';

describe('PromptDialog', () => {
  const mockProps = {
    open: true,
    prompt: 'This is a test prompt with a {{variable}}.',
    index: 0,
    onAdd: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the dialog with the correct title, text, and buttons when 'open' is true", () => {
    render(<PromptDialog {...mockProps} />);

    expect(screen.getByText('Add Prompt')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Add Prompt' })).toHaveAccessibleDescription(
      'Each prompt runs once for every test case and provider. Use variables when the input should change between test cases.',
    );

    const textField = screen.getByRole('textbox');
    expect(textField).toBeInTheDocument();
    expect(textField).toHaveValue(mockProps.prompt);

    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add and create another' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('should update the text field value and internal state when the user types in the TextField', async () => {
    const user = userEvent.setup();
    render(<PromptDialog {...mockProps} />);
    const textField = screen.getByRole('textbox');
    const newValue = 'This is a new test prompt.';

    await user.click(textField);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(newValue);

    expect(textField).toHaveValue(newValue);
  });

  it('should call onAdd with the current editingPrompt, clear the text field, and call onCancel when the Add button is clicked', async () => {
    const user = userEvent.setup();
    render(<PromptDialog {...mockProps} />);
    const addButton = screen.getByRole('button', { name: 'Add' });
    await user.click(addButton);

    expect(mockProps.onAdd).toHaveBeenCalledWith(mockProps.prompt);
    expect(mockProps.onCancel).toHaveBeenCalled();
  });

  it('acknowledges a saved prompt and focuses the field when adding another', async () => {
    const user = userEvent.setup();
    render(<PromptDialog {...mockProps} />);

    const textField = screen.getByRole('textbox');
    await user.click(textField);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('New prompt text');

    const addButton = screen.getByRole('button', { name: 'Add and create another' });
    await user.click(addButton);

    expect(mockProps.onAdd).toHaveBeenCalledWith('New prompt text');
    expect(textField).toHaveValue('');
    expect(textField).toHaveFocus();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(
      'Prompt added. Each prompt runs across every test case and provider. Enter the next prompt.',
    );
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Discard prompt changes?')).toBeNull();
    expect(mockProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when the "Cancel" button is clicked', async () => {
    const user = userEvent.setup();
    render(<PromptDialog {...mockProps} />);
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);
    expect(mockProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('confirms before discarding unsaved prompt changes', async () => {
    const user = userEvent.setup();
    render(<PromptDialog {...mockProps} prompt="" />);

    await user.type(screen.getByRole('textbox'), 'Draft prompt');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.getByRole('dialog', { name: 'Discard prompt changes?' }),
    ).toHaveAccessibleDescription('Your unsaved prompt text will be lost.');
    expect(mockProps.onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Continue editing' }));
    expect(screen.queryByText('Discard prompt changes?')).toBeNull();
    expect(screen.getByRole('textbox')).toHaveValue('Draft prompt');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(mockProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('resets an abandoned add draft when the dialog is reopened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PromptDialog {...mockProps} prompt="" />);

    await user.type(screen.getByRole('textbox'), 'Discard this');
    rerender(<PromptDialog {...mockProps} prompt="" open={false} />);
    rerender(<PromptDialog {...mockProps} prompt="" open={true} />);

    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it("should disable the 'Add' and 'Add and create another' buttons when the text field is empty", () => {
    render(<PromptDialog {...mockProps} prompt="" />);

    expect(
      screen.getByText(/Each prompt runs once for every test case and provider/i),
    ).toBeInTheDocument();
    const textField = screen.getByRole('textbox');
    const addButton = screen.getByRole('button', { name: 'Add' });
    const addAnotherButton = screen.getByRole('button', { name: 'Add and create another' });

    expect(textField).toBeRequired();
    expect(textField).toHaveAccessibleDescription(/Required.*varname/);
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveAccessibleDescription(/Required.*varname/);
    expect(addAnotherButton).toBeDisabled();
    expect(addAnotherButton).toHaveAccessibleDescription(/Required.*varname/);
  });

  it('should reject whitespace-only prompt text with an accessible explanation', async () => {
    const user = userEvent.setup();
    render(<PromptDialog {...mockProps} prompt="" />);

    const textField = screen.getByRole('textbox');
    await user.type(textField, '   ');

    expect(textField).toHaveAttribute('aria-invalid', 'true');
    expect(textField).toHaveAccessibleDescription('Prompt must include text, not only spaces.');
    expect(screen.getByRole('button', { name: 'Add' })).toHaveAccessibleDescription(
      'Prompt must include text, not only spaces.',
    );
    expect(screen.getByRole('button', { name: 'Add and create another' })).toBeDisabled();
    expect(mockProps.onAdd).not.toHaveBeenCalled();
  });

  it('should update the text field value when the prompt prop changes', () => {
    const { rerender } = render(<PromptDialog {...mockProps} />);
    const newPrompt = 'This is a new test prompt.';
    rerender(<PromptDialog {...mockProps} prompt={newPrompt} />);

    const textField = screen.getByRole('textbox');
    expect(textField).toHaveValue(newPrompt);
  });

  it('should initialize editingPrompt state with the current prompt when transitioning from closed to open', () => {
    const initialPrompt = 'Initial prompt';
    const { rerender } = render(
      <PromptDialog
        open={false}
        prompt={initialPrompt}
        index={0}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    act(() => {
      rerender(
        <PromptDialog
          open={true}
          prompt={initialPrompt}
          index={0}
          onAdd={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
    });

    const textField = screen.getByRole('textbox');
    expect(textField).toBeInTheDocument();
    expect(textField).toHaveValue(initialPrompt);
  });
});
