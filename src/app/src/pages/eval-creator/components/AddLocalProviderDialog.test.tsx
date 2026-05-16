import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AddLocalProviderDialog from './AddLocalProviderDialog';

// Mock the fileExtensions utility
vi.mock('@promptfoo/util/fileExtensions', () => ({
  isJavascriptFile: vi.fn((path: string) => {
    return (
      path.endsWith('.js') ||
      path.endsWith('.ts') ||
      path.endsWith('.jsx') ||
      path.endsWith('.tsx') ||
      path.endsWith('.mjs') ||
      path.endsWith('.cjs')
    );
  }),
}));

describe('AddLocalProviderDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onAdd: vi.fn(),
  };

  it('renders when open is true', () => {
    render(<AddLocalProviderDialog {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add Local Provider')).toBeInTheDocument();
    expect(screen.getByLabelText('Provider Path')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<AddLocalProviderDialog {...defaultProps} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<AddLocalProviderDialog {...defaultProps} />);

    expect(
      screen.getByText(/Enter the absolute path to your local provider implementation/),
    ).toBeInTheDocument();
  });

  it('renders input with placeholder', () => {
    render(<AddLocalProviderDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText('/absolute/path/to/your/provider.py');
    expect(input).toBeInTheDocument();
  });

  it('renders helper text with example', () => {
    render(<AddLocalProviderDialog {...defaultProps} />);

    expect(screen.getByText(/Example: \/home\/user\/projects\/my-provider.py/)).toBeInTheDocument();
  });

  it('renders Cancel and Add Provider buttons', () => {
    render(<AddLocalProviderDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Provider' })).toBeInTheDocument();
  });

  it('updates input value when typing', async () => {
    const user = userEvent.setup();
    render(<AddLocalProviderDialog {...defaultProps} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.py');

    expect(input).toHaveValue('/path/to/provider.py');
  });

  it('clears error when typing after an error', async () => {
    const user = userEvent.setup();
    render(<AddLocalProviderDialog {...defaultProps} />);

    // Submit without entering a path to trigger error
    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(screen.getByText('Path is required')).toBeInTheDocument();

    // Type in input to clear error
    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.py');

    expect(screen.queryByText('Path is required')).not.toBeInTheDocument();
  });

  it('shows error when submitting with empty path', async () => {
    const user = userEvent.setup();
    render(<AddLocalProviderDialog {...defaultProps} />);

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(screen.getByText('Path is required')).toBeInTheDocument();
    expect(defaultProps.onAdd).not.toHaveBeenCalled();
  });

  it('shows error when submitting with whitespace-only path', async () => {
    const user = userEvent.setup();
    render(<AddLocalProviderDialog {...defaultProps} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '   ');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(screen.getByText('Path is required')).toBeInTheDocument();
    expect(defaultProps.onAdd).not.toHaveBeenCalled();
  });

  it('shows error for unsupported file extension', async () => {
    const user = userEvent.setup();
    render(<AddLocalProviderDialog {...defaultProps} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.txt');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(
      screen.getByText('Only javascript, python, go and ruby files are supported'),
    ).toBeInTheDocument();
    expect(defaultProps.onAdd).not.toHaveBeenCalled();
  });

  it('accepts Python files (.py)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.py');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file:///path/to/provider.py',
      config: {},
      label: 'provider.py',
    });
  });

  it('accepts JavaScript files (.js)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.js');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file:///path/to/provider.js',
      config: {},
      label: 'provider.js',
    });
  });

  it('accepts TypeScript files (.ts)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.ts');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file:///path/to/provider.ts',
      config: {},
      label: 'provider.ts',
    });
  });

  it('accepts Go files (.go)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.go');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file:///path/to/provider.go',
      config: {},
      label: 'provider.go',
    });
  });

  it('accepts Ruby files (.rb)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.rb');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file:///path/to/provider.rb',
      config: {},
      label: 'provider.rb',
    });
  });

  it('extracts filename from path as label', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/very/long/path/to/my-custom-provider.py');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file:///very/long/path/to/my-custom-provider.py',
      config: {},
      label: 'my-custom-provider.py',
    });
  });

  it('uses full path as label if no directory separator', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, 'provider.py');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file://provider.py',
      config: {},
      label: 'provider.py',
    });
  });

  it('trims whitespace from path', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '  /path/to/provider.py  ');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file:///path/to/provider.py',
      config: {},
      label: 'provider.py',
    });
  });

  it('calls onClose after successful submission', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onClose={onClose} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.py');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('clears path after successful submission', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AddLocalProviderDialog {...defaultProps} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.py');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    // Reopen dialog
    rerender(<AddLocalProviderDialog {...defaultProps} open={false} />);
    rerender(<AddLocalProviderDialog {...defaultProps} open={true} />);

    const newInput = screen.getByLabelText('Provider Path');
    expect(newInput).toHaveValue('');
  });

  it('clears error after successful submission', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AddLocalProviderDialog {...defaultProps} />);

    // First, create an error
    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);
    expect(screen.getByText('Path is required')).toBeInTheDocument();

    // Then submit successfully
    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.py');
    await user.click(addButton);

    // Reopen dialog
    rerender(<AddLocalProviderDialog {...defaultProps} open={false} />);
    rerender(<AddLocalProviderDialog {...defaultProps} open={true} />);

    expect(screen.queryByText('Path is required')).not.toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onClose={onClose} />);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('clears path when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AddLocalProviderDialog {...defaultProps} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.py');

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    // Reopen dialog
    rerender(<AddLocalProviderDialog {...defaultProps} open={false} />);
    rerender(<AddLocalProviderDialog {...defaultProps} open={true} />);

    const newInput = screen.getByLabelText('Provider Path');
    expect(newInput).toHaveValue('');
  });

  it('clears error when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AddLocalProviderDialog {...defaultProps} />);

    // Create an error
    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);
    expect(screen.getByText('Path is required')).toBeInTheDocument();

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    // Reopen dialog
    rerender(<AddLocalProviderDialog {...defaultProps} open={false} />);
    rerender(<AddLocalProviderDialog {...defaultProps} open={true} />);

    expect(screen.queryByText('Path is required')).not.toBeInTheDocument();
  });

  it('clears state when dialog is closed via onOpenChange', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<AddLocalProviderDialog {...defaultProps} onClose={onClose} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.py');

    // Trigger error
    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    // Close via X button (triggers onOpenChange)
    const closeButton = screen.getByRole('button', { name: 'Close' });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalled();

    // Reopen dialog
    rerender(<AddLocalProviderDialog {...defaultProps} open={false} />);
    rerender(<AddLocalProviderDialog {...defaultProps} open={true} />);

    const newInput = screen.getByLabelText('Provider Path');
    expect(newInput).toHaveValue('');
    expect(screen.queryByText('Path is required')).not.toBeInTheDocument();
  });

  it('applies error styling to input when error is present', async () => {
    const user = userEvent.setup();
    render(<AddLocalProviderDialog {...defaultProps} />);

    const input = screen.getByLabelText('Provider Path');
    const addButton = screen.getByRole('button', { name: 'Add Provider' });

    // Input should not have error styling initially
    expect(input).not.toHaveClass('border-destructive');

    // Submit to trigger error
    await user.click(addButton);

    expect(input).toHaveClass('border-destructive');
  });

  it('accepts .jsx files via isJavascriptFile', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.jsx');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file:///path/to/provider.jsx',
      config: {},
      label: 'provider.jsx',
    });
  });

  it('accepts .tsx files via isJavascriptFile', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.tsx');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file:///path/to/provider.tsx',
      config: {},
      label: 'provider.tsx',
    });
  });

  it('accepts .mjs files via isJavascriptFile', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.mjs');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file:///path/to/provider.mjs',
      config: {},
      label: 'provider.mjs',
    });
  });

  it('accepts .cjs files via isJavascriptFile', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLocalProviderDialog {...defaultProps} onAdd={onAdd} />);

    const input = screen.getByLabelText('Provider Path');
    await user.type(input, '/path/to/provider.cjs');

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledWith({
      id: 'file:///path/to/provider.cjs',
      config: {},
      label: 'provider.cjs',
    });
  });
});
