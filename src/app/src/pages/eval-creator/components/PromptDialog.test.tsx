import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  const renderWithTheme = (component: React.ReactNode) => {
    const theme = createTheme();
    return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
  };

  it("should render the dialog with the correct title, text, and buttons when 'open' is true", () => {
    renderWithTheme(<PromptDialog {...mockProps} />);

    expect(screen.getByText(`Edit Prompt ${mockProps.index + 1}`)).toBeInTheDocument();

    const textField = screen.getByRole('textbox');
    expect(textField).toBeInTheDocument();
    expect(textField).toHaveValue(mockProps.prompt);

    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Another' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('should update the text field value and internal state when the user types in the TextField', () => {
    renderWithTheme(<PromptDialog {...mockProps} />);
    const textField = screen.getByRole('textbox');
    const newValue = 'This is a new test prompt.';

    fireEvent.change(textField, { target: { value: newValue } });

    expect(textField).toHaveValue(newValue);
  });

  it('should call onAdd with the current editingPrompt, clear the text field, and call onCancel when the Add button is clicked', () => {
    renderWithTheme(<PromptDialog {...mockProps} />);
    const addButton = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addButton);

    expect(mockProps.onAdd).toHaveBeenCalledWith(mockProps.prompt);
    expect(mockProps.onCancel).toHaveBeenCalled();
  });

  it('should call onAdd, clear the text field, and focus the text field when the Add Another button is clicked', () => {
    renderWithTheme(<PromptDialog {...mockProps} />);

    const textField = screen.getByRole('textbox');
    fireEvent.change(textField, { target: { value: 'New prompt text' } });

    const addButton = screen.getByRole('button', { name: 'Add Another' });
    fireEvent.click(addButton);

    expect(mockProps.onAdd).toHaveBeenCalledWith('New prompt text');
    expect(textField).toHaveValue('');
    expect(textField).toHaveFocus();
  });

  it('should call onCancel when the "Cancel" button is clicked', () => {
    renderWithTheme(<PromptDialog {...mockProps} />);
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);
    expect(mockProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("should disable the 'Add' and 'Add Another' buttons when the text field is empty", () => {
    renderWithTheme(<PromptDialog {...mockProps} prompt="" />);

    const addButton = screen.getByRole('button', { name: 'Add' });
    const addAnotherButton = screen.getByRole('button', { name: 'Add Another' });

    expect(addButton).toBeDisabled();
    expect(addAnotherButton).toBeDisabled();
  });

  it('should update the text field value when the prompt prop changes', () => {
    const { rerender } = renderWithTheme(<PromptDialog {...mockProps} />);
    const newPrompt = 'This is a new test prompt.';
    rerender(<PromptDialog {...mockProps} prompt={newPrompt} />);

    const textField = screen.getByRole('textbox');
    expect(textField).toHaveValue(newPrompt);
  });

  it('should initialize editingPrompt state with the current prompt when transitioning from closed to open', () => {
    const initialPrompt = 'Initial prompt';
    const { rerender } = renderWithTheme(
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
