import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdvancedOptionsDialog from './AdvancedOptionsDialog';

import type { ScanOptions } from '../ModelAudit.types';

const theme = createTheme();
describe('AdvancedOptionsDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnOptionsChange = vi.fn();

  const defaultScanOptions = {
    blacklist: [],
    timeout: 3600,
    maxSize: undefined,
    strict: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly when open', () => {
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={mockOnClose}
          scanOptions={defaultScanOptions}
          onOptionsChange={mockOnOptionsChange}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Advanced Scan Options')).toBeInTheDocument();
    expect(screen.getByLabelText('Add pattern')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3600')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Strict Mode/ })).not.toBeChecked();
  });

  it('initializes with provided scanOptions', () => {
    const initialOptions = {
      blacklist: ['test-pattern'],
      timeout: 1200,
      maxSize: '500MB',
      strict: true,
    };
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={mockOnClose}
          scanOptions={initialOptions}
          onOptionsChange={mockOnOptionsChange}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('test-pattern')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1200')).toBeInTheDocument();
    expect(screen.getByDisplayValue('500MB')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Strict Mode/ })).toBeChecked();
  });

  it('adds a blacklist pattern', () => {
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={mockOnClose}
          scanOptions={defaultScanOptions}
          onOptionsChange={mockOnOptionsChange}
        />
      </ThemeProvider>,
    );
    const input = screen.getByLabelText('Add pattern');
    fireEvent.change(input, { target: { value: 'new-pattern' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('new-pattern')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('removes a blacklist pattern', () => {
    const initialOptions = { ...defaultScanOptions, blacklist: ['pattern1', 'pattern2'] };
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={mockOnClose}
          scanOptions={initialOptions}
          onOptionsChange={mockOnOptionsChange}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('pattern1')).toBeInTheDocument();
    // Find the Chip component containing 'pattern1' and trigger its delete
    const pattern1Text = screen.getByText('pattern1');
    const chipContainer = pattern1Text.closest('[role="button"]');
    // Look for the delete icon within the chip (MUI uses a cancel/close icon)
    const deleteIcon = chipContainer?.querySelector('svg');
    if (deleteIcon) {
      fireEvent.click(deleteIcon);
    }
    expect(screen.queryByText('pattern1')).not.toBeInTheDocument();
    expect(screen.getByText('pattern2')).toBeInTheDocument();
  });

  it('updates timeout value', () => {
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={mockOnClose}
          scanOptions={defaultScanOptions}
          onOptionsChange={mockOnOptionsChange}
        />
      </ThemeProvider>,
    );
    const timeoutInput = screen.getByDisplayValue('3600');
    fireEvent.change(timeoutInput, { target: { value: '1800' } });
    expect(timeoutInput).toHaveValue(1800);
  });

  it('updates maxSize value', () => {
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={mockOnClose}
          scanOptions={defaultScanOptions}
          onOptionsChange={mockOnOptionsChange}
        />
      </ThemeProvider>,
    );
    const maxSizeInput = screen.getByPlaceholderText('e.g., 1GB, 500MB');
    fireEvent.change(maxSizeInput, { target: { value: '1GB' } });
    expect(maxSizeInput).toHaveValue('1GB');
  });

  it('toggles strict mode', () => {
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={mockOnClose}
          scanOptions={defaultScanOptions}
          onOptionsChange={mockOnOptionsChange}
        />
      </ThemeProvider>,
    );
    const strictModeSwitch = screen.getByRole('switch', { name: /Strict Mode/ });
    expect(strictModeSwitch).not.toBeChecked();
    fireEvent.click(strictModeSwitch);
    expect(strictModeSwitch).toBeChecked();
  });

  it('calls onOptionsChange and onClose when Save Options is clicked', () => {
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={mockOnClose}
          scanOptions={defaultScanOptions}
          onOptionsChange={mockOnOptionsChange}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Options' }));
    expect(mockOnOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        blacklist: [],
        timeout: 3600,
        maxSize: undefined,
        strict: false,
      }),
    );
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose but not onOptionsChange when Cancel is clicked', () => {
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={mockOnClose}
          scanOptions={defaultScanOptions}
          onOptionsChange={mockOnOptionsChange}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnOptionsChange).not.toHaveBeenCalled();
  });

  it('allows user to clear timeout, blur, and clamps to 3600', async () => {
    const onOptionsChange = vi.fn();
    const user = (await import('@testing-library/user-event')).default.setup();

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={{ blacklist: [], timeout: 120 }}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const timeoutInput = screen.getByRole('spinbutton');

    await user.type(timeoutInput, '{backspace}{backspace}{backspace}');
    expect(timeoutInput).toHaveValue(null);

    // Blur the input to trigger the onBlur clamp
    timeoutInput.blur();

    // After blur, the component state should clamp timeout to 3600
    await waitFor(() => {
      expect(timeoutInput).toHaveValue(3600);
    });

    // Save and ensure onOptionsChange receives the clamped value
    const save = screen.getByRole('button', { name: /save options/i });
    await user.click(save);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining({ timeout: 3600 }));
  });

  it('allows user to clear timeout, type a number, and uses that number', async () => {
    const onOptionsChange = vi.fn();
    const user = (await import('@testing-library/user-event')).default.setup();

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={{ blacklist: [], timeout: 120 }}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const timeoutInput = screen.getByRole('spinbutton');

    await user.type(timeoutInput, '{backspace}{backspace}{backspace}');
    await user.type(timeoutInput, '45');

    expect(timeoutInput).toHaveValue(45);

    const save = screen.getByRole('button', { name: /save options/i });
    await user.click(save);

    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining({ timeout: 45 }));
  });

  it('should handle invalid maxSize formats and pass them to onOptionsChange', () => {
    const onOptionsChange = vi.fn();
    const invalidSize = 'ABC';

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={{ blacklist: [], timeout: 0 }}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const input = screen.getByPlaceholderText('e.g., 1GB, 500MB');
    fireEvent.change(input, { target: { value: invalidSize } });

    const saveButton = screen.getByText('Save Options');
    fireEvent.click(saveButton);

    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSize: invalidSize,
      }),
    );
  });

  it('should accept and pass extremely large timeout values to onOptionsChange', async () => {
    const onOptionsChange = vi.fn();
    const user = (await import('@testing-library/user-event')).default.setup();

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={{ blacklist: [], timeout: 3600 }}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const timeoutInput = screen.getByRole('spinbutton');
    const largeTimeoutValue = Number.MAX_SAFE_INTEGER;

    await user.clear(timeoutInput);
    await user.type(timeoutInput, String(largeTimeoutValue));

    const saveButton = screen.getByText('Save Options');
    fireEvent.click(saveButton);

    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: largeTimeoutValue,
      }),
    );
  });

  it('should not add an empty pattern to localOptions.blacklist when the user tries to add an empty string', () => {
    const onOptionsChange = vi.fn();
    const initialScanOptions: ScanOptions = {
      blacklist: [],
      timeout: 300,
    };

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={initialScanOptions}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const blacklistInput = screen.getByLabelText('Add pattern');
    const addButton = screen.getByRole('button', { name: 'Add' });
    const chipBefore = screen.queryAllByRole('button', { name: 'delete' });

    fireEvent.change(blacklistInput, { target: { value: '   ' } });
    fireEvent.click(addButton);

    const chipAfter = screen.queryAllByRole('button', { name: 'delete' });
    expect(chipAfter.length).toBe(chipBefore.length);
    expect(blacklistInput).toHaveValue('   ');
  });

  it('should not persist changes when the dialog is closed without saving', () => {
    const onClose = vi.fn();
    const onOptionsChange = vi.fn();
    const initialScanOptions: ScanOptions = {
      blacklist: [],
      timeout: 300,
    };

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={onClose}
          scanOptions={initialScanOptions}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const timeoutInput = screen.getByRole('spinbutton');
    fireEvent.change(timeoutInput, { target: { value: '600' } });
    expect(timeoutInput).toHaveValue(600);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onOptionsChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
