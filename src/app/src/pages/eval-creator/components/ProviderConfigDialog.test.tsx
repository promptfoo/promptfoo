import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProviderConfigDialog from './ProviderConfigDialog';

describe('ProviderConfigDialog', () => {
  const defaultProps = {
    open: true,
    providerId: 'openai:gpt-4',
    config: { temperature: 0.7, max_tokens: 2048 },
    onClose: vi.fn(),
    onSave: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog with provider ID', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.getByText('Provider Configuration')).toBeInTheDocument();
    expect(screen.getByText('openai:gpt-4')).toBeInTheDocument();
  });

  it('displays initial config in JSON editor', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    const textField = screen.getByLabelText('Configuration (JSON)') as HTMLTextAreaElement;
    expect(textField.value).toContain('"temperature": 0.7');
    expect(textField.value).toContain('"max_tokens": 2048');
  });

  it('shows documentation link for known providers', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    const link = screen.getByText('openai provider documentation');
    expect(link).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/providers/openai/');
  });

  it('shows quick start template buttons', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.getByText('Use openai defaults')).toBeInTheDocument();
  });

  it('applies template when clicked', async () => {
    render(<ProviderConfigDialog {...defaultProps} config={{}} />);

    const templateButton = screen.getByText('Use openai defaults');
    fireEvent.click(templateButton);

    await waitFor(() => {
      const textField = screen.getByLabelText('Configuration (JSON)') as HTMLTextAreaElement;
      expect(textField.value).toContain('"temperature": 0.7');
      expect(textField.value).toContain('"max_tokens": 2048');
    });
  });

  it('calls onSave with updated config', async () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    const textField = screen.getByLabelText('Configuration (JSON)');
    fireEvent.change(textField, {
      target: { value: '{"temperature": 0.9, "max_tokens": 4096}' },
    });

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(defaultProps.onSave).toHaveBeenCalledWith('openai:gpt-4', {
        temperature: 0.9,
        max_tokens: 4096,
      });
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('disables Save button when JSON is invalid', async () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    const textField = screen.getByLabelText('Configuration (JSON)');
    fireEvent.change(textField, { target: { value: '{invalid json' } });

    await waitFor(() => {
      const saveButton = screen.getByText('Save');
      expect(saveButton).toBeDisabled();
    });
  });

  it('shows error message for invalid JSON', async () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    const textField = screen.getByLabelText('Configuration (JSON)');
    fireEvent.change(textField, { target: { value: '{invalid' } });

    await waitFor(() => {
      const errors = screen.getAllByText('Invalid JSON');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  it('shows configured fields summary', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.getByText(/Configured fields:/)).toBeInTheDocument();
    expect(screen.getByText(/temperature, max_tokens/)).toBeInTheDocument();
  });

  it('handles empty config', () => {
    render(<ProviderConfigDialog {...defaultProps} config={{}} />);

    const textField = screen.getByLabelText('Configuration (JSON)') as HTMLTextAreaElement;
    expect(textField.value).toBe('{}');
  });

  it('does not show doc link for unknown providers', () => {
    render(<ProviderConfigDialog {...defaultProps} providerId="custom:provider" />);

    expect(screen.queryByText(/provider documentation/)).not.toBeInTheDocument();
  });

  it('resets config when dialog reopens with different provider', async () => {
    const { rerender } = render(<ProviderConfigDialog {...defaultProps} />);

    // Close and reopen with different provider
    rerender(
      <ProviderConfigDialog
        {...defaultProps}
        open={false}
        providerId="anthropic:claude"
        config={{ temperature: 0.5 }}
      />,
    );

    rerender(
      <ProviderConfigDialog
        {...defaultProps}
        open={true}
        providerId="anthropic:claude"
        config={{ temperature: 0.5 }}
      />,
    );

    await waitFor(() => {
      const textField = screen.getByLabelText('Configuration (JSON)') as HTMLTextAreaElement;
      expect(textField.value).toContain('"temperature": 0.5');
    });
  });

  it('handles anthropic provider documentation', () => {
    render(<ProviderConfigDialog {...defaultProps} providerId="anthropic:claude-3" />);

    const link = screen.getByText('anthropic provider documentation');
    expect(link).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/providers/anthropic/');
  });

  it('handles azure provider with template', () => {
    render(<ProviderConfigDialog {...defaultProps} providerId="azure:gpt-4" config={{}} />);

    expect(screen.getByText('Use azure defaults')).toBeInTheDocument();
  });
});
