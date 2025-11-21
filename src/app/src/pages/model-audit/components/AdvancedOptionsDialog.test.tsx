import { useState } from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdvancedOptionsDialog from './AdvancedOptionsDialog';

import type { ScanOptions } from '../ModelAudit.types';

const theme = createTheme();

describe('AdvancedOptionsDialog', () => {
  it('should initialize localOptions with merged values from defaultScanOptions and scanOptions when opened', () => {
    const scanOptionsFromProps: ScanOptions = {
      blacklist: ['/user-defined-pattern/'],
      timeout: 500,
    };

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={scanOptionsFromProps}
          onOptionsChange={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('/user-defined-pattern/')).toBeInTheDocument();
    expect(screen.getByDisplayValue('500')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., 1GB, 500MB')).toHaveValue('');
    expect(screen.getByLabelText(/Strict Mode/i)).not.toBeChecked();
  });

  it('should update localOptions when the scanOptions prop changes after the dialog is already open', async () => {
    const initialScanOptions: ScanOptions = {
      blacklist: ['initial'],
      timeout: 100,
      maxSize: '1GB',
      strict: true,
    };

    const updatedScanOptions: ScanOptions = {
      blacklist: ['updated'],
      timeout: 200,
      maxSize: '2GB',
      strict: false,
    };

    const TestComponent = () => {
      const [currentScanOptions, setScanOptions] = useState(initialScanOptions);

      return (
        <ThemeProvider theme={theme}>
          <AdvancedOptionsDialog
            open={true}
            onClose={vi.fn()}
            scanOptions={currentScanOptions}
            onOptionsChange={vi.fn()}
          />
          <button data-testid="update-options" onClick={() => setScanOptions(updatedScanOptions)}>
            Update Options
          </button>
        </ThemeProvider>
      );
    };

    const { getByTestId } = render(<TestComponent />);

    expect(screen.getByRole('button', { name: 'initial' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1GB')).toBeInTheDocument();
    expect(screen.getByLabelText(/Strict Mode/i)).toBeChecked();

    await act(async () => {
      getByTestId('update-options').click();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'updated' })).toBeInTheDocument();
      expect(screen.getByDisplayValue('200')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2GB')).toBeInTheDocument();
      expect(screen.getByLabelText(/Strict Mode/i)).not.toBeChecked();
    });
  });

  it('should add a new pattern to localOptions.blacklist and clear the input when the user enters a pattern and clicks the Add button', () => {
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

    const testPattern = 'test-pattern';
    fireEvent.change(blacklistInput, { target: { value: testPattern } });
    fireEvent.click(addButton);

    const chip = screen.getByText(testPattern);
    expect(chip).toBeInTheDocument();

    expect(blacklistInput).toHaveValue('');
  });

  it('should remove the correct pattern from localOptions.blacklist when the user clicks the delete icon on a Chip', () => {
    const initialBlacklist = ['pattern1', 'pattern2', 'pattern3'];
    const scanOptionsFromProps: ScanOptions = {
      blacklist: initialBlacklist,
      timeout: 1000,
    };
    const onOptionsChange = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={scanOptionsFromProps}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const chipToDelete = screen.getByText('pattern2').closest('div');
    const deleteIcon = chipToDelete?.querySelector('svg');

    if (deleteIcon) {
      fireEvent.click(deleteIcon);
    }

    expect(onOptionsChange).toHaveBeenCalledTimes(0);

    const saveButton = screen.getByText('Save Options');
    fireEvent.click(saveButton);

    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        blacklist: ['pattern1', 'pattern3'],
      }),
    );
  });

  it('should update localOptions.timeout when the user changes the timeout input field', () => {
    const onOptionsChange = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={{
            blacklist: [],
            timeout: 300,
          }}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const timeoutInput = screen.getByRole('spinbutton');
    fireEvent.change(timeoutInput, { target: { value: '600' } });
    expect(timeoutInput).toHaveValue(600);
  });

  it('should update localOptions.maxSize when the user enters a value in the Maximum Size Limit field', () => {
    const newValue = '500MB';
    const onOptionsChange = vi.fn();

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
    fireEvent.change(input, { target: { value: newValue } });

    expect(input).toHaveValue(newValue);
  });

  it('should update localOptions.strict when the user toggles the Strict Mode switch', () => {
    const onOptionsChange = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={{ strict: false, blacklist: [], timeout: 1000 }}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const strictModeSwitch = screen.getByLabelText(/Strict Mode/i);
    fireEvent.click(strictModeSwitch);

    const saveButton = screen.getByText('Save Options');
    fireEvent.click(saveButton);

    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        strict: true,
      }),
    );
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
