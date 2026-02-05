import type { ComponentProps } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptEditor } from './PromptEditor';

const MockCodeDisplay = vi.fn(
  ({
    content,
    onCopy,
    showCopyButton,
  }: {
    content: string;
    onCopy?: () => void;
    showCopyButton?: boolean;
  }) => (
    <div>
      <div data-testid="mock-code-display">{content}</div>
      {showCopyButton && (
        <button data-testid="copy-button" onClick={onCopy}>
          Copy
        </button>
      )}
    </div>
  ),
);

describe('PromptEditor', () => {
  let defaultProps: ComponentProps<typeof PromptEditor>;

  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps = {
      prompt: 'This is the original prompt.',
      editMode: false,
      editedPrompt: 'This is the original prompt.',
      replayLoading: false,
      replayError: null,
      onEditModeChange: vi.fn(),
      onPromptChange: vi.fn(),
      onReplay: vi.fn(),
      onCancel: vi.fn(),
      onCopy: vi.fn(),
      copied: false,
      hoveredElement: null,
      onMouseEnter: vi.fn(),
      onMouseLeave: vi.fn(),
      CodeDisplay: MockCodeDisplay,
      subtitleTypographyClassName: 'mb-2 font-medium text-base',
    };
  });

  it('should render the prompt using CodeDisplay and show the edit button when editMode is false', () => {
    render(<PromptEditor {...defaultProps} />);

    expect(screen.getByTestId('mock-code-display')).toBeInTheDocument();
    expect(screen.getByText('This is the original prompt.')).toBeInTheDocument();
    expect(MockCodeDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        content: defaultProps.prompt,
      }),
      undefined,
    );

    expect(screen.getByRole('button', { name: /edit & replay/i })).toBeInTheDocument();

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('should show a TextField with the editedPrompt value and Replay/Cancel buttons when editMode is true', () => {
    const editedPromptValue = 'This is the edited prompt.';
    defaultProps = {
      ...defaultProps,
      editMode: true,
      editedPrompt: editedPromptValue,
    };

    render(<PromptEditor {...defaultProps} />);

    const textField = screen.getByRole('textbox');
    expect(textField).toBeInTheDocument();
    expect(textField).toHaveValue(editedPromptValue);

    expect(screen.getByRole('button', { name: 'Replay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /edit & replay/i })).not.toBeInTheDocument();

    expect(screen.queryByTestId('mock-code-display')).not.toBeInTheDocument();
  });

  it('should call onReplay when the Replay button is clicked in edit mode', () => {
    const onReplayMock = vi.fn();
    defaultProps = {
      ...defaultProps,
      editMode: true,
      onReplay: onReplayMock,
      editedPrompt: 'This is the edited prompt.',
    };
    render(<PromptEditor {...defaultProps} />);

    const replayButton = screen.getByRole('button', { name: 'Replay' });
    fireEvent.click(replayButton);

    expect(onReplayMock).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel, exit edit mode, and reset the prompt value when the Cancel button is clicked in edit mode', () => {
    defaultProps.editMode = true;
    const onCancelMock = vi.fn();
    const onEditModeChangeMock = vi.fn();
    const onPromptChangeMock = vi.fn();
    defaultProps.onCancel = onCancelMock;
    defaultProps.onEditModeChange = onEditModeChangeMock;
    defaultProps.onPromptChange = onPromptChangeMock;

    render(<PromptEditor {...defaultProps} />);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    expect(onCancelMock).toHaveBeenCalledTimes(1);
    expect(onEditModeChangeMock).toHaveBeenCalledTimes(1);
    expect(onEditModeChangeMock).toHaveBeenCalledWith(false);
    expect(onPromptChangeMock).toHaveBeenCalledTimes(1);
    expect(onPromptChangeMock).toHaveBeenCalledWith('This is the original prompt.');
  });

  it('should call onPromptChange with the new value when the TextField value changes in edit mode', () => {
    const onPromptChange = vi.fn();
    defaultProps = {
      ...defaultProps,
      editMode: true,
      onPromptChange: onPromptChange,
    };
    render(<PromptEditor {...defaultProps} />);

    const textField = screen.getByRole('textbox');
    const newValue = 'This is the new prompt value.';

    fireEvent.change(textField, { target: { value: newValue } });

    expect(onPromptChange).toHaveBeenCalledWith(newValue);
  });

  it('should display an error Alert when replayError is set', () => {
    const errorMessage = 'This is a test error message.';
    render(<PromptEditor {...defaultProps} replayError={errorMessage} />);

    const alertElement = screen.getByText(errorMessage);
    expect(alertElement).toBeInTheDocument();
    expect(alertElement.closest('div[role="alert"]')).toBeInTheDocument();
  });

  it('should call onCopy when the Copy button in CodeDisplay is clicked (when not in edit mode)', () => {
    defaultProps.hoveredElement = 'prompt';
    render(<PromptEditor {...defaultProps} />);

    const copyButton = screen.getByTestId('copy-button');
    fireEvent.click(copyButton);

    expect(defaultProps.onCopy).toHaveBeenCalledTimes(1);
  });

  it('should handle and display prompts exceeding maxRows in edit mode', () => {
    const longPrompt = 'This is a very long prompt.\n'.repeat(30);
    defaultProps.editMode = true;
    defaultProps.editedPrompt = longPrompt;

    render(<PromptEditor {...defaultProps} />);

    const textField = screen.getByRole('textbox');
    expect(textField).toBeInTheDocument();
    expect(textField).toHaveValue(longPrompt);
  });

  it('should disable the Replay button when editedPrompt contains only whitespace', () => {
    const props = {
      ...defaultProps,
      editMode: true,
      editedPrompt: '   \t\n  ',
    };
    render(<PromptEditor {...props} />);

    const replayButton = screen.getByRole('button', { name: 'Replay' });
    expect(replayButton).toBeDisabled();
  });

  it('should handle and validate prompts with template variables when edited', () => {
    const onPromptChange = vi.fn();
    defaultProps = {
      ...defaultProps,
      editMode: true,
      editedPrompt: 'This is the original prompt with {{variable}}.',
      onPromptChange: onPromptChange,
    };

    render(<PromptEditor {...defaultProps} />);

    const textField = screen.getByRole('textbox');
    expect(textField).toBeInTheDocument();

    const newPromptValue =
      'This is the edited prompt with a modified {{variable}} and a new {{another_variable}}.';
    fireEvent.change(textField, { target: { value: newPromptValue } });

    expect(onPromptChange).toHaveBeenCalledWith(newPromptValue);
  });

  it('should not show edit button when readOnly is true', () => {
    render(<PromptEditor {...defaultProps} readOnly={true} />);

    expect(screen.getByTestId('mock-code-display')).toBeInTheDocument();
    expect(screen.getByText('This is the original prompt.')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /edit & replay/i })).not.toBeInTheDocument();
  });

  it('should not show replay and cancel buttons when readOnly is true and editMode is true', () => {
    render(<PromptEditor {...defaultProps} readOnly={true} editMode={true} />);

    expect(screen.queryByRole('button', { name: 'Replay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit & replay/i })).not.toBeInTheDocument();
  });

  it('should show edit button when readOnly is false (default behavior)', () => {
    render(<PromptEditor {...defaultProps} readOnly={false} />);

    expect(screen.getByRole('button', { name: /edit & replay/i })).toBeInTheDocument();
  });

  it('should show edit button when readOnly is not provided (default behavior)', () => {
    render(<PromptEditor {...defaultProps} />);

    expect(screen.getByRole('button', { name: /edit & replay/i })).toBeInTheDocument();
  });
});
